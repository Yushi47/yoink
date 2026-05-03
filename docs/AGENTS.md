# yoink

Universal headless file downloader. If a human can click download on it, yoink can too.

```bash
yoink https://gofile.io/d/mAiKoO
yoink -o ~/Downloads -p secret https://gofile.io/d/private
yoink url1 url2 url3
yoink -f urls.txt
```

## Stack
Node.js + TypeScript + Playwright. `pool.ts` and `operations.ts` ported from sage. One change: `acceptDownloads: true` on the browser context.

## Resolver chain
Auto-loaded from `resolvers/`. To add a site: drop a file exporting `matches(url)` and `click(page, opts)`. No other changes needed.

```
direct (HEAD check, no browser) → gofile.ts → rootz.ts → generic (fallback heuristic)
```

## Batch
Worker queue in `cli.ts`, concurrency cap of 3. One failure doesn't stop the rest.

## Shell security
Always `execFileSync('cmd', [arg1, arg2])` — never `exec(\`cmd ${userInput}\`)`.

## Dependencies
- `playwright` — browser + download interception
- `commander` — CLI arg parsing, TS-native
- `typescript` + `tsx` — run TS directly, no build step
- `@types/node` — Node built-ins
