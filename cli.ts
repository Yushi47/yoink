#!/usr/bin/env tsx

import fs from 'fs';
import { Command } from 'commander';
import { downloadFile } from './downloader';
import { browserPool } from './pool';
import { abortAllOperations, requestShutdown } from './operations';
import { log, logErr } from './utils';

const BATCH_CONCURRENCY = 3;

const program = new Command();
let shutdownPromise: Promise<void> | null = null;
let receivedSignal: NodeJS.Signals | null = null;

function isAbortError(error: unknown) {
    return error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted');
}

function parseTimeoutMs(raw: string): number {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
        throw new Error(`Invalid --timeout "${raw}": expected a positive integer (milliseconds)`);
    }
    const n = parseInt(trimmed, 10);
    if (n <= 0) {
        throw new Error(`Invalid --timeout "${raw}": expected a positive integer (milliseconds)`);
    }
    return n;
}

function readUrlsFromFile(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf8');
    return content
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('#'));
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) break;
            await fn(items[i], i);
        }
    });
    await Promise.all(workers);
}

async function shutdown(signal?: NodeJS.Signals) {
    if (signal && !receivedSignal) {
        receivedSignal = signal;
        log('\n[yoink] Shutting down...');
    }

    if (shutdownPromise) {
        return shutdownPromise;
    }

    shutdownPromise = (async () => {
        requestShutdown();
        await abortAllOperations();
        await browserPool.shutdown();
    })();

    return shutdownPromise;
}

program
    .name('yoink')
    .description('Universal headless file downloader')
    .argument('[urls...]', 'URLs to download')
    .option('-o, --output <dir>', 'Output directory', './downloads')
    .option('-p, --password <password>', 'Password for the file')
    .option('-t, --timeout <ms>', 'Timeout in milliseconds', '300000')
    .option('-f, --file <path>', 'Read URLs from file (one per line; # starts a comment)')
    .action(async (urls: string[], options: { output: string; password?: string; timeout: string; file?: string }) => {
        let timeoutMs: number;
        try {
            timeoutMs = parseTimeoutMs(options.timeout);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logErr(`[yoink] ${msg}`);
            process.exitCode = 1;
            return;
        }

        const fileUrls = options.file ? readUrlsFromFile(options.file) : [];
        const allUrls = [...urls, ...fileUrls];

        if (allUrls.length === 0) {
            logErr('[yoink] Provide at least one URL, or use -f/--file with a URL list');
            process.exitCode = 1;
            return;
        }

        const optsBase = {
            outputDir: options.output,
            password: options.password,
            timeout: timeoutMs
        };

        try {
            if (allUrls.length === 1) {
                await downloadFile(allUrls[0], { url: allUrls[0], ...optsBase });
            } else {
                let failures = 0;
                await runWithConcurrency(allUrls, BATCH_CONCURRENCY, async (url) => {
                    try {
                        await downloadFile(url, { url, ...optsBase });
                    } catch (error: unknown) {
                        if (isAbortError(error) && receivedSignal) {
                            throw error;
                        }
                        failures++;
                        const msg = error instanceof Error ? error.message : String(error);
                        logErr(`[yoink] error (${url}): ${msg}`);
                    }
                });
                if (failures > 0) {
                    process.exitCode = 1;
                }
            }
        } catch (error: unknown) {
            if (isAbortError(error) && receivedSignal) {
                process.exitCode = receivedSignal === 'SIGINT' ? 130 : 143;
            } else {
                process.exitCode = 1;
                const msg = error instanceof Error ? error.message : String(error);
                logErr(`[yoink] error: ${msg}`);
            }
        } finally {
            await shutdown();
        }
    });

const handleSignal = (signal: NodeJS.Signals) => {
    if (receivedSignal) {
        logErr('\n[yoink] Forcing exit');
        process.exit(signal === 'SIGINT' ? 130 : 143);
    }
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    void shutdown(signal).catch((error: unknown) => {
        process.exitCode = 1;
        const msg = error instanceof Error ? error.message : String(error);
        logErr(`[yoink] shutdown error: ${msg}`);
    });
};

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

void (async () => {
    try {
        await program.parseAsync();
    } catch (error: unknown) {
        process.exitCode = 1;
        if (!isAbortError(error)) {
            const msg = error instanceof Error ? error.message : String(error);
            logErr(`[yoink] fatal: ${msg}`);
        }
        await shutdown();
    }
})();
