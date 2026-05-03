# yoink — Build Plan

## Structure
```
yoink/
├── config.ts
├── pool.ts
├── operations.ts
├── downloader.ts
├── resolvers/
│   ├── types.ts       # Resolver interface: matches(url) + click(page, opts)
│   ├── direct.ts
│   ├── gofile.ts
│   ├── rootz.ts
│   └── generic.ts
├── cli.ts
├── tsconfig.json
└── package.json
```

---

## Phase 1 — Working Core

Goal: `yoink https://gofile.io/d/abc` downloads a file.

1. `package.json` + `tsconfig.json` — deps: playwright, commander, typescript, tsx, @types/node. Add `"bin": { "yoink": "./cli.ts" }` so `npm install -g .` makes `yoink` a real command
2. `config.ts` — copy CONFIG shape from sage, swap SELECTORS for DOWNLOAD_TIMEOUT + OUTPUT_DIR
3. `pool.ts` — port from sage, add `acceptDownloads: true` to browser context
4. `operations.ts` — port from sage, type the operation map
5. `resolvers/types.ts` — define `Resolver` interface: `matches(url: string): boolean`, `click(page: Page, opts: DownloadOpts): Promise<void>`
6. `resolvers/direct.ts` — HEAD request → Content-Disposition/MIME check → stream with fetch. Implements `Resolver`
7. `downloader.ts` — auto-load all resolver files, build chain, `page.waitForEvent('download')` capture, save to disk
8. `resolvers/gofile.ts` — inspect live page for selector, wait → click. Implements `Resolver`
9. `cli.ts` — single URL, `-o`, `-p`, `-t` flags via commander, graceful shutdown (SIGTERM/SIGINT). Any shell calls use `execFileSync` with args array, never `exec` with string
10. `downloader.ts` progress output — `[yoink] downloading filename...` → `[done] filename  X MB  (Xs)`. Auto-create output dir, auto-rename on filename collision (`file.zip` → `file-1.zip`)

**Setup after install:**
```bash
npm install
npx playwright install chromium
npm install -g .
```

**Done when:** `yoink https://gofile.io/d/mAiKoO` saves a file to `./downloads` with visible progress output.

---

## Phase 2 — Expand

Goal: batch, more sites, unknown site fallback.

1. `resolvers/rootz.ts` — inspect rootz.so live page, implement selector. Implements `Resolver`
2. `resolvers/generic.ts` — scan for `a[download]`, download-extension hrefs, button text heuristics. Implements `Resolver`
3. `cli.ts` batch — add multi-URL positional args + `-f urls.txt`, worker queue with concurrency cap of 3

**Done when:** `yoink url1 url2 url3` runs concurrently, rootz.so works, unknown sites fall back to generic.
