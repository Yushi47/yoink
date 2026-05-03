import { Resolver, DownloadOpts } from './types';
import { throwIfAborted } from './abort-helpers';
import { uniqueOutputPath, renderProgressLine, log } from '../utils';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { Page } from 'playwright';

const HEAD_PROBE_MS = 5000;

export const resolver: Resolver = {
    async matches(url: string): Promise<boolean> {
        try {
            const res = await fetch(url, {
                method: 'HEAD',
                redirect: 'follow',
                signal: AbortSignal.timeout(HEAD_PROBE_MS),
            });
            const contentType = res.headers.get('content-type') || '';
            const contentDisposition = res.headers.get('content-disposition') || '';

            if (contentDisposition.includes('attachment')) return true;
            if (contentType.startsWith('application/') && !contentType.includes('json') && !contentType.includes('xml') && !contentType.includes('html')) return true;
            if (contentType.startsWith('video/') || contentType.startsWith('audio/') || contentType.startsWith('image/')) return true;

            return false;
        } catch {
            return false;
        }
    },

    needsBrowser: false,

    async click(_page: Page | null, opts: DownloadOpts): Promise<void> {
        throwIfAborted(opts);

        const res = await fetch(opts.url, { redirect: 'follow', signal: opts.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        let filename = 'downloaded_file';
        const cd = res.headers.get('content-disposition');
        if (cd) {
            const match = cd.match(/filename="?([^"]+)"?/);
            if (match) filename = match[1];
        } else {
            const urlPath = new URL(opts.url).pathname;
            const base = path.basename(urlPath);
            if (base) filename = base;
        }

        if (!fs.existsSync(opts.outputDir)) {
            fs.mkdirSync(opts.outputDir, { recursive: true });
        }

        const outPath = uniqueOutputPath(opts.outputDir, filename);
        const label = path.basename(outPath);
        const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);

        log(`[yoink] downloading ${label}...`);
        const startTime = Date.now();

        try {
            throwIfAborted(opts);

            if (res.body) {
                const fileStream = fs.createWriteStream(outPath);
                const onAbort = () => fileStream.destroy(new Error('Operation aborted'));
                opts.signal?.addEventListener('abort', onAbort, { once: true });

                let prevBytes = 0;
                let prevTime = startTime;
                let progressTimer: ReturnType<typeof setInterval> | null = null;

                try {
                    if (process.stdout.isTTY) {
                        progressTimer = setInterval(() => {
                            const written = fileStream.bytesWritten;
                            const now = Date.now();
                            const elapsed = (now - prevTime) / 1000;
                            const speed = elapsed > 0 ? ((written - prevBytes) / 1024 / 1024 / elapsed).toFixed(1) : '0.0';
                            prevBytes = written;
                            prevTime = now;
                            process.stdout.write(`\r${renderProgressLine(label, written, totalBytes, speed)}   `);
                        }, 500);
                    }
                    // Web ReadableStream from fetch; cast avoids DOM vs Node stream typing friction
                    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fileStream);
                } finally {
                    if (progressTimer) clearInterval(progressTimer);
                    if (process.stdout.isTTY) process.stdout.write('\n');
                    opts.signal?.removeEventListener('abort', onAbort);
                }
            } else {
                const buffer = await res.arrayBuffer();
                throwIfAborted(opts);
                fs.writeFileSync(outPath, Buffer.from(buffer));
            }
        } catch (error) {
            if (fs.existsSync(outPath)) {
                fs.unlinkSync(outPath);
            }
            throw error;
        }

        const stats = fs.statSync(outPath);
        const mb = (stats.size / 1024 / 1024).toFixed(2);
        const sec = ((Date.now() - startTime) / 1000).toFixed(1);
        const avgSpeed = (stats.size / 1024 / 1024 / parseFloat(sec)).toFixed(1);
        log(`[done] ${label}  ${mb} MB  ${avgSpeed} MB/s  (${sec}s)`);
    }
};
