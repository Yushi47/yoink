import { Resolver, DownloadOpts } from './types';
import { Page } from 'playwright';
import { throwIfAborted, withAbort } from './abort-helpers';

// Known ad network domains used in Rootz's download popup chain
const AD_DOMAINS = ['host44p.cfd', 'cloud02y.cfd', 'filehost89.sbs'];

export const resolver: Resolver = {
    matches(url: string): boolean {
        return /rootz\.so/i.test(url);
    },

    async click(page: Page | null, opts: DownloadOpts): Promise<void> {
        if (!page) throw new Error('rootz requires a browser page');

        console.log(`[yoink] navigating to ${opts.url}...`);
        await withAbort(opts.signal, page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 60000 }));
        throwIfAborted(opts);

        // Block known ad network domains and mock window.open to return null,
        // simulating uBlock Origin. Rootz detects the blocked popup and falls
        // back to a direct download on the 3rd click attempt.
        await page.route('**/*', (route) => {
            if (AD_DOMAINS.some(d => route.request().url().includes(d))) return route.abort();
            return route.continue();
        });

        await page.evaluate(() => { window.open = () => null; });

        const btn = page.locator('#rootz-download-button');
        await withAbort(opts.signal, btn.waitFor({ state: 'visible', timeout: 30000 }));
        throwIfAborted(opts);

        console.log('[yoink] clicking download button 3 times (1s apart)...');
        for (let i = 0; i < 3; i++) {
            throwIfAborted(opts);
            await withAbort(opts.signal, btn.click());
            if (i < 2) await new Promise(r => setTimeout(r, 1000));
        }
    }
};
