import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Resolver, DownloadOpts } from './resolvers/types';
import { uniqueOutputPath } from './utils';
import { browserPool } from './pool';
import { Page, Download } from 'playwright';
import { attachOperationPage, isShutdownRequested, registerOperation, unregisterOperation } from './operations';

// Waits for a download on the page OR on any popup it opens, whichever fires first.
// Uses page.on (not once) to handle sites that open an ad popup before the real download popup.
function waitForDownload(page: Page, timeoutMs: number): Promise<Download> {
    return new Promise((resolve, reject) => {
        let done = false;

        const cleanup = () => page.off('popup', onPopup);

        const settle = (dl: Download) => {
            if (!done) { done = true; clearTimeout(timer); cleanup(); resolve(dl); }
        };

        const fail = (err: Error) => {
            if (!done) { done = true; clearTimeout(timer); cleanup(); reject(err); }
        };

        const timer = setTimeout(
            () => fail(new Error(`Download timed out after ${timeoutMs}ms`)),
            timeoutMs
        );
        (timer as NodeJS.Timeout).unref?.();

        const onPopup = (popup: Page) => {
            popup.waitForEvent('download', { timeout: timeoutMs }).then(settle).catch(() => {});
        };

        page.waitForEvent('download', { timeout: timeoutMs }).then(settle).catch(() => {});
        page.on('popup', onPopup);
    });
}

const resolversDir = path.join(__dirname, 'resolvers');
const resolverFiles = fs.readdirSync(resolversDir).filter(file => {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    return (ext === '.ts' || ext === '.js') && !file.endsWith('.d.ts') && base !== 'types' && base !== 'abort-helpers';
});

const resolvers: { name: string, resolver: Resolver }[] = [];

for (const file of resolverFiles) {
    const mod = require(path.join(resolversDir, file));
    const name = path.basename(file, path.extname(file));
    if (mod.resolver) {
        resolvers.push({ name, resolver: mod.resolver });
    }
}

const order = ['gofile', 'rootz', 'direct', 'generic'];
resolvers.sort((a, b) => {
    let ia = order.indexOf(a.name);
    let ib = order.indexOf(b.name);
    if (ia === -1) ia = 99;
    if (ib === -1) ib = 99;
    return ia - ib;
});

export async function downloadFile(url: string, opts: DownloadOpts) {
    let matchedResolver: { name: string, resolver: Resolver } | null = null;

    for (const r of resolvers) {
        if (await r.resolver.matches(url)) {
            matchedResolver = r;
            break;
        }
    }

    if (!matchedResolver) {
        throw new Error(`No resolver matched url: ${url}`);
    }

    const operationId = randomUUID();
    let page: Page | null = null;

    try {
        const signal = registerOperation(operationId);
        const isBrowserNeeded = matchedResolver.resolver.needsBrowser !== false;
        const resolverOpts: DownloadOpts = { ...opts, signal };

        const throwIfAborted = () => {
            if (signal.aborted || isShutdownRequested()) {
                throw new Error('Operation aborted');
            }
        };

        if (isBrowserNeeded) {
            throwIfAborted();
            await browserPool.initialize();
            throwIfAborted();
            page = await browserPool.acquirePage();
            attachOperationPage(operationId, page);
        }

        throwIfAborted();

        if (isBrowserNeeded && page) {
            throwIfAborted();

            const downloadPromise = waitForDownload(page, opts.timeout || 300000);
            try {
                await matchedResolver.resolver.click(page, resolverOpts);
            } catch (err) {
                downloadPromise.catch(() => {});
                throw err;
            }

            throwIfAborted();
            console.log('[yoink] waiting for download...');
            const download = await downloadPromise;
            const filename = download.suggestedFilename() || path.basename(new URL(download.url()).pathname) || 'download';

            if (!fs.existsSync(opts.outputDir)) {
                fs.mkdirSync(opts.outputDir, { recursive: true });
            }

            const outPath = uniqueOutputPath(opts.outputDir, filename);

            const startTime = Date.now();
            const readStream = await download.createReadStream();
            if (!readStream) throw new Error('Failed to open download stream');

            const writeStream = fs.createWriteStream(outPath);
            let bytesWritten = 0;
            let prevBytes = 0;
            let prevTime = startTime;
            let progressTimer: ReturnType<typeof setInterval> | null = null;

            const onAbort = () => {
                void download.cancel().catch(() => {});
                readStream.destroy();
                writeStream.destroy();
            };
            signal.addEventListener('abort', onAbort, { once: true });

            try {
                throwIfAborted();

                progressTimer = setInterval(() => {
                    if (process.stdout.isTTY) {
                        const now = Date.now();
                        const elapsed = (now - prevTime) / 1000;
                        const speed = elapsed > 0 ? ((bytesWritten - prevBytes) / 1024 / 1024 / elapsed).toFixed(1) : '0.0';
                        prevBytes = bytesWritten;
                        prevTime = now;
                        process.stdout.write(`\r[yoink] ${path.basename(outPath)}  ${(bytesWritten / 1024 / 1024).toFixed(1)} MB  ${speed} MB/s   `);
                    }
                }, 500);

                await new Promise<void>((resolve, reject) => {
                    readStream.on('data', (chunk: Buffer) => { bytesWritten += chunk.length; });
                    readStream.on('error', reject);
                    writeStream.on('error', reject);
                    writeStream.on('finish', resolve);
                    readStream.pipe(writeStream);
                });

                throwIfAborted();
            } catch (error) {
                if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
                throw error;
            } finally {
                if (progressTimer) clearInterval(progressTimer);
                if (process.stdout.isTTY) process.stdout.write('\n');
                signal.removeEventListener('abort', onAbort);
            }

            const stats = fs.statSync(outPath);
            const mb = (stats.size / 1024 / 1024).toFixed(2);
            const sec = ((Date.now() - startTime) / 1000).toFixed(1);
            const avgSpeed = (stats.size / 1024 / 1024 / parseFloat(sec)).toFixed(1);
            console.log(`[done] ${path.basename(outPath)}  ${mb} MB  ${avgSpeed} MB/s  (${sec}s)`);
        } else {
            throwIfAborted();
            await matchedResolver.resolver.click(null, resolverOpts);
        }
    } finally {
        unregisterOperation(operationId);
        if (page) {
            await browserPool.releasePage(page);
        }
    }
}
