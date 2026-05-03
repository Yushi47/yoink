# yoink

Universal headless file downloader. If a human can click download on it, `yoink` can too.

```bash
yoink https://gofile.io/d/mAiKoO
yoink -o ~/Downloads -p secret https://gofile.io/d/private
yoink url1 url2 url3
yoink -f urls.txt
```

## Stack
Node.js + TypeScript + Playwright. No build step — `tsx` runs `.ts` files directly via shebang.

## Resolver chain
Registered with static imports in `downloader.ts`. To add a site: create the resolver file, import it, and insert it into the `resolvers` array in priority order. Set `needsBrowser: false` to skip the browser entirely (like `direct.ts`).

```
gofile → rootz → direct (needsBrowser: false) → generic (fallback heuristic)
```

## Ad blocking
`BrowserContext.route()` is set up in `pool.ts` for every context before any page opens. Blocks common ad/tracker domains and the rootz-specific ad networks. Applies automatically to all pages and popups.

## Batch
Worker queue in `cli.ts`, concurrency cap of 3. One failure doesn't stop the rest.

## Shell security
Always `execFileSync('cmd', [arg1, arg2])` — never `exec(\`cmd ${userInput}\`)`.

## Dependencies
- `playwright` — browser + download interception
- `commander` — CLI arg parsing
- `typescript` + `tsx` — run TS directly, no build step
- `@types/node` — Node built-ins
