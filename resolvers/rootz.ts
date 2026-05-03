import { Resolver, DownloadOpts } from './types';
import { Page } from 'playwright';
import { throwIfAborted, withAbort } from './abort-helpers';
import { log } from '../utils';

export const resolver: Resolver = {
    matches(url: string): boolean {
        try {
            const { hostname } = new URL(url);
            return hostname.toLowerCase() === 'rootz.so' || hostname.toLowerCase().endsWith('.rootz.so');
        } catch {
            return false;
        }
    },

    async click(page: Page | null, opts: DownloadOpts): Promise<void> {
        if (!page) throw new Error('rootz requires a browser page');

        log(`[yoink] navigating to ${opts.url}...`);
        await withAbort(opts.signal, page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 60000 }));
        throwIfAborted(opts);

        // Mock window.open to return null, simulating uBlock Origin.
        // Rootz detects the blocked popup and falls back to a direct download on the 3rd click attempt.
        // Ad domain blocking is handled at context level in pool.ts.
        await page.evaluate(() => { window.open = () => null; });

        const btn = page.locator('#rootz-download-button');
        await withAbort(opts.signal, btn.waitFor({ state: 'visible', timeout: 30000 }));
        throwIfAborted(opts);

        log('[yoink] clicking download button 3 times (1s apart)...');
        for (let i = 0; i < 3; i++) {
            throwIfAborted(opts);
            await withAbort(opts.signal, btn.click());
            if (i < 2) await new Promise(r => setTimeout(r, 1000));
        }
    }
};
