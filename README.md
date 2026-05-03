# yoink

Universal headless file downloader. If a human can click download on it, `yoink` can too.

## Installation

```bash
npm install
npx playwright install chromium
sudo npm install -g tsx
sudo npm install -g .
```

## Usage

```bash
# Basic download
yoink https://gofile.io/d/example

# Download with a password
yoink -p secret https://gofile.io/d/private

# Download to a specific directory
yoink -o ~/Downloads https://gofile.io/d/example

# Several URLs at once (max 3 concurrent)
yoink https://example.com/a https://example.com/b https://example.com/c

# URLs from a file (one per line; lines starting with # are comments)
yoink -f urls.txt

# Combine positional URLs with a file list
yoink -f more.txt https://gofile.io/d/example
```

> **URLs with `&` in them** (e.g. Discord CDN, signed S3 links) must be single-quoted so
> the shell does not split them into background jobs:
> ```bash
> # wrong — & splits the URL into separate shell jobs
> yoink https://cdn.discordapp.com/attachments/.../file.zip?ex=abc&is=def&hm=xyz
>
> # correct
> yoink 'https://cdn.discordapp.com/attachments/.../file.zip?ex=abc&is=def&hm=xyz'
> ```

### Options

| Flag | Name | Description | Default |
|---|---|---|---|
| `-o` | `--output <dir>` | Output directory | `./downloads` |
| `-p` | `--password <pwd>` | Password for the file | |
| `-t` | `--timeout <ms>` | Timeout in milliseconds | `300000` |
| `-f` | `--file <path>` | Read extra URLs from file | |
| `-h` | `--help` | Display help | |

## Supported sites

| Resolver | Site | Method |
|---|---|---|
| `gofile` | gofile.io | Waits for download button, clicks it |
| `rootz` | rootz.so | Simulates uBlock Origin, clicks 3× with 1s gap |
| `direct` | Any direct URL | HEAD probe + fetch stream, no browser |
| `generic` | Anything else | Scans `a[download]`, file-extension hrefs, button text |

## Adding a resolver

Drop a `.ts` file in `resolvers/` exporting a `resolver` object:

```ts
import { Resolver } from './types';

export const resolver: Resolver = {
    matches(url) { return url.includes('example.com'); },
    async click(page, opts) {
        await page!.goto(opts.url);
        await page!.locator('#download').click();
    }
};
```

Set `needsBrowser: false` if no browser is needed (like `direct.ts`).
