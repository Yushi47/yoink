import { Resolver, DownloadOpts } from './types';
import { Page } from 'playwright';
import { throwIfAborted, withAbort } from './abort-helpers';
import { log } from '../utils';

export const resolver: Resolver = {
    matches(url: string): boolean {
        try {
            const { hostname } = new URL(url);
            return hostname === 'gofile.io' || hostname.endsWith('.gofile.io');
        } catch {
            return false;
        }
    },

    async click(page: Page | null, opts: DownloadOpts): Promise<void> {
        if (!page) throw new Error('gofile requires a browser page');

        log(`[yoink] navigating to ${opts.url}...`);

        await withAbort(opts.signal, page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 60000 }));

        throwIfAborted(opts);

        if (opts.password) {
            const pwdInput = page.locator('input[type="password"]');
            if (await pwdInput.count() > 0) {
                await withAbort(opts.signal, pwdInput.fill(opts.password));
                await withAbort(opts.signal, pwdInput.press('Enter'));
            }
        }

        throwIfAborted(opts);

        const downloadBtn = page.locator('button.item_download').first();
        await withAbort(opts.signal, downloadBtn.waitFor({ state: 'visible', timeout: 60000 }));

        throwIfAborted(opts);

        log('[yoink] clicking download button...');
        await withAbort(opts.signal, downloadBtn.click());
    }
};
