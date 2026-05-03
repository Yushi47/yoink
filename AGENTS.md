# yoink

Universal headless file downloader. If a human can click download on it, yoink can too.

```bash
yoink https://gofile.io/d/mAiKoO
yoink -o ~/Downloads -p secret https://gofile.io/d/private
yoink url1 url2 url3
yoink -f urls.txt
```

## Stack
Node.js + TypeScript + Playwright. `pool.ts` and `operations.ts` ported from sage (`acceptDownloads: true` added to browser context).

## Resolver chain
Auto-loaded from `resolvers/`. Drop a file exporting `{ resolver }` to add a site — no other changes needed. Set `needsBrowser: false` to skip the browser entirely.

```
gofile → rootz → direct (needsBrowser: false) → generic (fallback heuristic)
```

## Batch
Worker queue in `cli.ts`, concurrency cap of 3. One failure doesn't stop the rest.

## Shell security
Always `execFileSync('cmd', [arg1, arg2])` — never `exec(\`cmd ${userInput}\`)`.

## Dependencies
- `playwright` — browser + download interception
- `commander` — CLI arg parsing
- `typescript` + `tsx` — run TS directly, no build step
- `@types/node` — Node built-ins
