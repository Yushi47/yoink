import { Page } from 'playwright';
import { CONFIG } from './config';
import { log, logErr } from './utils';

interface Operation {
    page?: Page;
    controller: AbortController;
    timestamp: number;
    stopPromise?: Promise<boolean>;
}

const activeOperations = new Map<string, Operation>(); // operationId -> Operation
const shutdownController = new AbortController();

function delay(ms: number) {
    return new Promise<void>(resolve => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}

export function registerOperation(id: string) {
    const existing = activeOperations.get(id);
    if (existing) {
        existing.timestamp = Date.now();
        if (shutdownController.signal.aborted && !existing.controller.signal.aborted) {
            existing.controller.abort();
        }
        return existing.controller.signal;
    }

    const controller = new AbortController();
    if (shutdownController.signal.aborted) {
        controller.abort();
    }
    activeOperations.set(id, { controller, timestamp: Date.now() });
    log(`[ops] Registered operation ${id}`);
    return controller.signal;
}

export function requestShutdown() {
    if (!shutdownController.signal.aborted) {
        shutdownController.abort();
    }
}

export function isShutdownRequested() {
    return shutdownController.signal.aborted;
}

export function attachOperationPage(id: string, page: Page) {
    const operation = activeOperations.get(id);
    if (!operation) return;

    operation.page = page;
    operation.timestamp = Date.now();

    if (operation.controller.signal.aborted) {
        void page.close().catch(() => {});
    }
}

export function unregisterOperation(id: string) {
    const op = activeOperations.get(id);
    if (!op) return;
    op.controller.abort();
    activeOperations.delete(id);
    log(`[ops] Unregistered operation ${id}`);
}

export async function stopOperation(id: string) {
    const operation = activeOperations.get(id);
    if (!operation) return false;

    if (operation.stopPromise) return operation.stopPromise;

    log(`[ops] Stopping operation ${id}`);
    operation.controller.abort();

    operation.stopPromise = (async (): Promise<boolean> => {
        let stopTimer: NodeJS.Timeout | undefined;
        try {
            return await Promise.race([
                (async (): Promise<boolean> => {
                    await delay(CONFIG.TIMEOUTS.ABORT_SIGNAL_WAIT);
                    if (operation.page && !operation.page.isClosed()) {
                        try {
                            await Promise.race([
                                operation.page.close(),
                                new Promise<never>((_, rej) => {
                                    const t = setTimeout(() => rej(new Error('Page close timeout')), CONFIG.TIMEOUTS.BROWSER_CLOSE);
                                    t.unref?.();
                                })
                            ]);
                            log(`[ops] Page closed for operation ${id}`);
                        } catch (closeError: unknown) {
                            const msg = closeError instanceof Error ? closeError.message : String(closeError);
                            logErr(`[ops] Error closing page for operation ${id}:`, msg);
                        }
                    }
                    return true;
                })(),
                new Promise<boolean>(resolve => {
                    stopTimer = setTimeout(() => {
                        log(`[ops] Stop timed out for operation ${id}, forcing cleanup`);
                        resolve(false);
                    }, CONFIG.TIMEOUTS.STOP_OPERATION);
                    stopTimer.unref?.();
                })
            ]);
        } finally {
            if (stopTimer) clearTimeout(stopTimer);
            unregisterOperation(id);
        }
    })();

    return operation.stopPromise;
}

export async function abortAllOperations() {
    const ids = Array.from(activeOperations.keys());
    const count = ids.length;
    if (count === 0) return;

    await Promise.allSettled(ids.map(id => stopOperation(id)));
    log(`[ops] Finished stopping ${count} in-flight operation(s) for shutdown`);
}
