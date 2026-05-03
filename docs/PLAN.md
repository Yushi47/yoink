# yoink — Build Plan

## Structure
```
yoink/
├── config.ts
├── pool.ts
├── operations.ts
├── downloader.ts
├── utils.ts           # uniqueOutputPath() shared by direct.ts and downloader.ts
├── resolvers/
│   ├── types.ts       # Resolver interface: needsBrowser?, matches(url), click(page, opts)
│   ├── abort-helpers.ts
│   ├── direct.ts
│   ├── gofile.ts
│   ├── rootz.ts
│   └── generic.ts
├── cli.ts
├── tsconfig.json
└── package.json
```

---

## Phase 1 — Working Core ✓

Goal: `yoink https://gofile.io/d/abc` downloads a file.

1. `package.json` + `tsconfig.json` — deps: playwright, commander, typescript, tsx, @types/node. `"bin": { "yoink": "./cli.ts" }` so `npm install -g .` makes `yoink` a real command
2. `config.ts` — timeouts, browser args, UA, viewport, pool tuning constants
3. `pool.ts` — ported from sage with `acceptDownloads: true`; crash recovery with exponential backoff
4. `operations.ts` — per-download AbortController tracking; `abortAllOperations()` for clean shutdown
5. `resolvers/types.ts` — `Resolver` interface: `needsBrowser?`, `matches(url)`, `click(page, opts)`
6. `resolvers/abort-helpers.ts` — `throwIfAborted(opts)` + `withAbort(signal, promise)`
7. `resolvers/direct.ts` — HEAD probe → Content-Disposition/MIME check → stream with fetch. Sets `needsBrowser: false`
8. `utils.ts` — `uniqueOutputPath(dir, filename)`: appends `-1`, `-2`, ... on collision
9. `downloader.ts` — auto-loads resolver files, `page.waitForEvent('download')` capture, progress bar, saves to disk
10. `resolvers/gofile.ts` — waits for `button.item_download`, clicks it
11. `cli.ts` — single URL, `-o`, `-p`, `-t`, `-f` flags via commander; graceful SIGINT/SIGTERM shutdown

**Setup:**
```bash
npm install
npx playwright install chromium
npm install -g .
```

---

## Phase 2 — Expand ✓

Goal: batch, more sites, unknown site fallback.

1. `resolvers/rootz.ts` — mocks `window.open = () => null`, blocks known ad domains, clicks 3× with 1s gap. Rootz detects the blocked popup and falls back to a direct download on the third click
2. `resolvers/generic.ts` — tries `a[download]`, then hrefs matching file extensions, then button text heuristics
3. `cli.ts` batch — multi-URL positional args + `-f urls.txt`, worker queue capped at 3 concurrent

**Done:** `yoink url1 url2 url3` runs concurrently; rootz.so and gofile.io work; unknown sites fall back to generic.

---

## Resolver priority order

```
gofile → rootz → direct (needsBrowser: false) → generic (fallback)
```

Resolvers are auto-loaded from `resolvers/`. To add a site: drop a new file exporting `{ resolver }`. No other changes needed. Set `needsBrowser: false` if the resolver handles the download without a browser.
