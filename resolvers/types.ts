import { Page } from 'playwright';

export interface DownloadOpts {
    url: string;
    outputDir: string;
    password?: string;
    timeout?: number;
    signal?: AbortSignal;
}

export interface Resolver {
    needsBrowser?: boolean;
    matches(url: string): boolean | Promise<boolean>;
    click(page: Page | null, opts: DownloadOpts): Promise<void>;
}
