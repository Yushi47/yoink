import { DownloadOpts } from './types';

export function throwIfAborted(opts?: Pick<DownloadOpts, 'signal'>) {
    const s = opts?.signal;
    if (s?.aborted) {
        throw new Error('Operation aborted');
    }
}

/**
 * Races a promise against abort; removes listener on settle.
 */
export async function withAbort<T>(signal: AbortSignal | undefined, promise: Promise<T>): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) {
        throw new Error('Operation aborted');
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            reject(new Error('Operation aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            v => {
                signal.removeEventListener('abort', onAbort);
                resolve(v);
            },
            e => {
                signal.removeEventListener('abort', onAbort);
                reject(e);
            }
        );
    });
}
