import { Resolver, DownloadOpts } from './types';
import { Page } from 'playwright';
import { throwIfAborted, withAbort } from './abort-helpers';
import { log } from '../utils';

const EXT_RE = /\.(zip|7z|rar|tar|gz|tgz|bz2|xz|iso|exe|dmg|apk|mp4|mkv|avi|mov|webm|pdf|docx?|xlsx?|pptx?|csv|torrent)(\?|#|$)/i;

const BTN_RE = /download|télécharger|herunterladen|descargar/i;

export const resolver: Resolver = {
    /** Fallback: any http(s) URL once higher-priority resolvers did not match */
    async matches(url: string): Promise<boolean> {
        return /^https?:\/\//i.test(url);
    },

    async click(page: Page | null, opts: DownloadOpts): Promise<void> {
        if (!page) throw new Error('generic resolver requires a browser page');

        log(`[yoink] (generic) navigating to ${opts.url}...`);

        await withAbort(opts.signal, page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 60000 }));

        throwIfAborted(opts);

        // 1) a[download]
        const withDl = page.locator('a[download]').first();
        if (await withDl.count() > 0) {
            await withAbort(opts.signal, withDl.waitFor({ state: 'visible', timeout: 30000 }));
            throwIfAborted(opts);
            await withAbort(opts.signal, withDl.click());
            return;
        }

        // 2) Anchors whose href looks like a direct file URL
        const allLinks = page.locator('a[href]');
        const n = await allLinks.count();
        const limit = Math.min(n, 200);
        for (let i = 0; i < limit; i++) {
            throwIfAborted(opts);
            const href = await allLinks.nth(i).getAttribute('href');
            if (href && EXT_RE.test(href)) {
                const loc = allLinks.nth(i);
                try {
                    await withAbort(opts.signal, loc.waitFor({ state: 'visible', timeout: 15000 }));
                } catch {
                    continue;
                }
                throwIfAborted(opts);
                await withAbort(opts.signal, loc.click());
                return;
            }
        }

        // 3) Button text heuristics
        const btn = page.getByRole('button', { name: BTN_RE }).first();
        await withAbort(opts.signal, btn.waitFor({ state: 'visible', timeout: 15000 }));
        throwIfAborted(opts);
        await withAbort(opts.signal, btn.click());
    }
};
