import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { CONFIG } from './config';

export class BrowserPoolError extends Error {
    code: string;
    constructor(message: string, code: string) {
        super(message);
        this.name = 'BrowserPoolError';
        this.code = code;
    }
}

class BrowserPool {
    private _state: 'idle' | 'launching' | 'ready' | 'relaunching' | 'failed' = 'idle';
    private _browser: Browser | null = null;
    private _launchPromise: Promise<void> | null = null;
    private _shutdownPromise: Promise<void> | null = null;
    private _consecutiveCrashes = 0;
    private _healthCheckTimer: NodeJS.Timeout | null = null;
    private _relaunchDelayTimer: NodeJS.Timeout | null = null;
    private _relaunchDelayResolve: ((shouldContinue: boolean) => void) | null = null;
    private _openPageCount = 0;
    private _shutdownRequested = false;
    private _knownBrowserPids = new Set<number>();

    async initialize() {
        if (this._shutdownPromise) {
            await this._shutdownPromise;
        }

        if (this._state === 'ready') return;

        if (this._launchPromise) {
            await this._launchPromise;
            return;
        }

        if (this._state === 'failed') {
            throw new BrowserPoolError('Browser pool has permanently failed', 'POOL_FAILED');
        }

        if (this._state !== 'idle') return;

        this._shutdownRequested = false;
        this._cleanupKnownOrphans();
        this._state = 'launching';
        const launchPromise = this._launchBrowser();
        this._launchPromise = launchPromise;

        try {
            await launchPromise;
        } finally {
            if (this._launchPromise === launchPromise) {
                this._launchPromise = null;
            }
        }
    }

    private _isFailedState(): boolean {
        return this._state === 'failed';
    }

    async acquirePage(): Promise<Page> {
        if (this._isFailedState()) {
            throw new BrowserPoolError('Browser pool has permanently failed', 'POOL_FAILED');
        }

        if (this._launchPromise) {
            let timeoutHandle: NodeJS.Timeout | undefined;
            try {
                const timedOut = await Promise.race([
                    this._launchPromise.then(() => false),
                    new Promise<boolean>(resolve => {
                        timeoutHandle = setTimeout(() => resolve(true), CONFIG.POOL.PAGE_ACQUIRE_TIMEOUT_MS);
                        timeoutHandle.unref?.();
                    })
                ]);
                if (timedOut) {
                    throw new BrowserPoolError('Timed out waiting for browser to become ready', 'POOL_TIMEOUT');
                }
            } finally {
                if (timeoutHandle) clearTimeout(timeoutHandle);
            }

            if (this._isFailedState()) {
                throw new BrowserPoolError('Browser pool has permanently failed', 'POOL_FAILED');
            }
        }

        if (this._state !== 'ready' || !this._browser) {
            throw new BrowserPoolError(`Pool in unexpected state: ${this._state}`, 'POOL_NOT_READY');
        }

        let context: BrowserContext | undefined;
        let page: Page | undefined;
        try {
            context = await this._browser.newContext({
                viewport: CONFIG.VIEWPORT,
                userAgent: CONFIG.USER_AGENT,
                acceptDownloads: true,
            });
            page = await context.newPage();
            page.setDefaultNavigationTimeout(CONFIG.TIMEOUTS.NAVIGATION);
            page.setDefaultTimeout(CONFIG.TIMEOUTS.DEFAULT_TIMEOUT);
        } catch (setupError) {
            if (page) await page.close().catch(() => {});
            if (context) await context.close().catch(() => {});
            throw setupError;
        }

        this._openPageCount++;
        if (this._openPageCount > 12) {
            console.warn(`[pool] Warning: ${this._openPageCount} pages open simultaneously`);
        }

        return page;
    }

    async releasePage(page?: Page) {
        this._openPageCount = Math.max(0, this._openPageCount - 1);
        if (page) {
            const context = page.context();
            await page.close().catch(() => {});
            await context.close().catch(() => {});
        }
    }

    async shutdown() {
        if (this._shutdownPromise) {
            return this._shutdownPromise;
        }

        this._shutdownRequested = true;
        console.log('[pool] Shutting down...');
        this._shutdownPromise = (async () => {
            this._stopHealthCheck();
            this._cancelRelaunchDelay();
            this._state = 'idle';

            const pendingLaunch = this._launchPromise;
            if (pendingLaunch) {
                await pendingLaunch.catch(() => {});
            }

            const browser = this._browser;
            this._browser = null;
            this._openPageCount = 0;
            this._launchPromise = null;

            if (browser) {
                const browserPid = this._getBrowserPid(browser);
                let closeTimer: NodeJS.Timeout | undefined;
                try {
                    await Promise.race([
                        browser.close(),
                        new Promise((_, rej) => {
                            closeTimer = setTimeout(() => rej(new Error('shutdown timeout')), CONFIG.TIMEOUTS.BROWSER_CLOSE);
                            closeTimer.unref?.();
                        })
                    ]);
                    console.log('[pool] Browser closed cleanly');
                } catch {
                    console.warn('[pool] Browser close timed out');
                    this._killKnownBrowserPid(browserPid);
                } finally {
                    if (closeTimer) clearTimeout(closeTimer);
                    if (browserPid !== null) {
                        this._knownBrowserPids.delete(browserPid);
                    }
                }
            }

            this._cleanupKnownOrphans();
            this._consecutiveCrashes = 0;
        })();

        try {
            await this._shutdownPromise;
        } finally {
            this._shutdownPromise = null;
        }
    }

    private async _launchBrowser() {
        try {
            const browser = await chromium.launch({
                headless: true,
                args: CONFIG.BROWSER_ARGS,
                timeout: CONFIG.TIMEOUTS.BROWSER_LAUNCH
            });

            const browserPid = this._getBrowserPid(browser);
            if (browserPid !== null) {
                this._knownBrowserPids.add(browserPid);
            }

            if (this._shutdownRequested || this._state === 'idle') {
                await browser.close().catch(() => {});
                if (browserPid !== null) {
                    this._knownBrowserPids.delete(browserPid);
                }
                return;
            }

            browser.on('disconnected', () => this._onDisconnected());

            this._browser = browser;
            this._state = 'ready';
            this._consecutiveCrashes = 0;
            this._startHealthCheck();
            this._cleanupKnownOrphans(browserPid);

            console.log('[pool] Browser ready');
        } catch (error) {
            this._state = this._shutdownRequested ? 'idle' : 'failed';
            throw error;
        }
    }

    private _onDisconnected() {
        if (this._shutdownRequested || this._state === 'relaunching' || this._state === 'failed' || this._state === 'idle') return;

        console.warn('[pool] Browser disconnected — starting relaunch sequence');
        this._state = 'relaunching';
        this._stopHealthCheck();
        this._browser = null;

        const relaunchPromise = (async () => {
            while (!this._shutdownRequested) {
                this._consecutiveCrashes++;

                if (this._consecutiveCrashes > CONFIG.POOL.RELAUNCH_MAX_ATTEMPTS) {
                    console.error(`[pool] Browser crashed ${this._consecutiveCrashes - 1} times consecutively — entering failed state`);
                    this._state = 'failed';
                    return;
                }

                const delay = Math.min(
                    CONFIG.POOL.RELAUNCH_BASE_DELAY_MS * Math.pow(CONFIG.POOL.RELAUNCH_BACKOFF_FACTOR, this._consecutiveCrashes - 1),
                    CONFIG.POOL.RELAUNCH_MAX_DELAY_MS
                );

                console.log(`[pool] Relaunch attempt ${this._consecutiveCrashes}/${CONFIG.POOL.RELAUNCH_MAX_ATTEMPTS} in ${delay}ms...`);
                const shouldContinue = await this._waitForRelaunchDelay(delay);
                if (!shouldContinue) {
                    return;
                }

                if (this._shutdownRequested || this._state === 'idle') {
                    console.log('[pool] Shutdown during relaunch — abandoning relaunch sequence');
                    return;
                }

                this._cleanupKnownOrphans();

                try {
                    await this._launchBrowser();
                    if (this._state === 'ready') {
                        console.log(`[pool] Browser relaunched successfully after ${this._consecutiveCrashes} crash(es)`);
                    }
                    return;
                } catch (error: any) {
                    console.error(`[pool] Relaunch attempt ${this._consecutiveCrashes} failed:`, error.message);
                }
            }
        })();

        this._launchPromise = relaunchPromise;
        void relaunchPromise.finally(() => {
            if (this._launchPromise === relaunchPromise) {
                this._launchPromise = null;
            }
        });
    }

    private _startHealthCheck() {
        this._stopHealthCheck();
        this._healthCheckTimer = setInterval(() => {
            if (this._state !== 'ready') return;
            if (!this._browser?.isConnected()) {
                console.warn('[pool] Health check: browser not connected — treating as crashed');
                this._onDisconnected();
            }
        }, CONFIG.POOL.HEALTH_CHECK_INTERVAL_MS);
    }

    private _stopHealthCheck() {
        if (this._healthCheckTimer) {
            clearInterval(this._healthCheckTimer);
            this._healthCheckTimer = null;
        }
    }

    private _waitForRelaunchDelay(ms: number) {
        return new Promise<boolean>(resolve => {
            this._relaunchDelayResolve = resolve;
            this._relaunchDelayTimer = setTimeout(() => {
                this._relaunchDelayTimer = null;
                this._relaunchDelayResolve = null;
                resolve(!this._shutdownRequested);
            }, ms);
            this._relaunchDelayTimer.unref?.();
        });
    }

    private _cancelRelaunchDelay() {
        if (this._relaunchDelayTimer) {
            clearTimeout(this._relaunchDelayTimer);
            this._relaunchDelayTimer = null;
        }

        if (this._relaunchDelayResolve) {
            this._relaunchDelayResolve(false);
            this._relaunchDelayResolve = null;
        }
    }

    private _getBrowserPid(browser: Browser) {
        try {
            const browserWithProcess = browser as Browser & { process?: () => { pid?: number } | undefined };
            return browserWithProcess.process?.()?.pid ?? null;
        } catch {
            return null;
        }
    }

    private _killKnownBrowserPid(pid: number | null) {
        if (pid === null) return;

        try {
            process.kill(pid, 0);
            process.kill(pid, 'SIGKILL');
            console.log(`[pool] Killed tracked Chrome process PID ${pid}`);
        } catch {
            // Process already gone
        } finally {
            this._knownBrowserPids.delete(pid);
        }
    }

    private _cleanupKnownOrphans(excludePid?: number | null) {
        for (const pid of Array.from(this._knownBrowserPids)) {
            if (excludePid !== undefined && pid === excludePid) {
                continue;
            }

            this._killKnownBrowserPid(pid);
        }
    }
}

export const browserPool = new BrowserPool();
