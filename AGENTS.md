<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Inline bold is stored as star-delimited paragraph text and safely rendered/serialized by the shared inline formatter; keep legacy emphasis sections readable to preserve existing articles.
- TS article imports are parsed as static literals using the TypeScript AST and validated against editor section schemas; never execute pasted code.
- Article section variants must stay synchronized across the canonical type, editor/export, import validation, formatted-text parser, and AI writer contract.
- Metadata-only JSON is parsed separately from article code, while remote card images reuse the shared server-side Base64 image fetcher.
- Cloudflare Workers Builds deploys from the root `wrangler.json`; nitro merges it into `dist/server/wrangler.json` at build time, so keep the worker name there in sync with the Cloudflare project.
- `package-lock.json` + `.npmrc` (legacy-peer-deps) exist only so npm-based CI can install; `bun.lock` stays the primary lockfile.
- Card thumbnails use a 2.037:1 ratio; the thumbnail frame preview never crops the stored image.
- JSON image import (`src/lib/json-images.ts` + `src/lib/image-fetch.functions.ts`) downloads every image server-side and stores it as a base64 data URL so remote links never rot; placement uses anchor_text (paragraph split, text preserved) then section_heading, else before/after fallback — the pasted JSON is data only, never executed.
- The AI agent runs as staged server functions (plan → Tavily research → write → independent review) in `src/lib/agent.functions.ts`, orchestrated client-side so each stage shows live progress and avoids long single requests; Gemini is called only via the user's own GEMINI_API_KEY secret (no gateway fallback, by user request).
- Articles are stored client-side in IndexedDB (`veguto` DB, `projects` store) via the async API in `src/lib/projects-store.ts`; it migrates the legacy `veguto:projects` localStorage key once, and save functions never throw (they return false and show a sonner toast) because Base64 images exceed localStorage's 5MB quota.
- Article image placement is planned per article in `src/lib/image-layout.ts` (float only with enough following text, consecutive tall images as a gallery, otherwise centered); images never decide their own float, so they cannot stack or leave gaps.
- Ready-made articles live as static JSON in `public/samples/` (images embedded as Base64 so they work on any host) and are added to IndexedDB once by `src/lib/sample-article.ts`; a localStorage flag stops a deleted sample from returning.
- The studio article direction is auto-detected from its text (`src/lib/article-direction.ts`, Arabic vs Latin letter count) because a title-only `dir="auto"` flipped Arabic articles with English titles.
- Editor Commands (`src/lib/article-commands.ts`) are validated JSON ops applied to a copy of the article, all-or-nothing, with remote images downloaded via the shared Base64 fetcher; long plain text may follow an `===ARTICLE===` line so it needs no JSON escaping; keep op section schemas in sync with the canonical Section type.
- The editor mirrors the open article to `/api/public/preview-sync` (dev preview only, files in /tmp, Base64 images uploaded once and replaced by short links) so the assistant can open the same article; a mirrored copy is never synced back.
- The editor version lives only in `src/version.ts` (`APP_VERSION`); the home "check for update" button compares it with the same file in the main GitHub copy and leaves a nudge (console line + dev-only `/tmp/veguto-update-nudge.json` via `/api/public/update-nudge`). When the user nudges or asks to check for updates, run `python3 scripts/github-sync.py status`, then `pull --apply` if GitHub is newer or raise `APP_VERSION` and `push` if this copy is newer, because the website cannot rewrite its own code.
- Home and Dashboard show the floating `BottomNav` via `WikiLayout withNav`; the studio keeps its own bottom toolbar, so it never gets the nav.
- Publishing writes to the main site repo under `content/`: `home.json` (normalized `SiteConfig` from `src/lib/site-config.ts`), `articles/<slug>.json`, `articles/index.json` (no sections), and `media/<hash>.<ext>` pictures pulled out of the Base64 article so the main site loads small files.
- ZIP upload replaces the whole code repo branch in one commit and never sends `.git`, `node_modules`, build output or `.env*` (`src/lib/zip-upload.ts`).

- The Dashboard reaches GitHub only through `githubProxy` (`src/lib/github-proxy.functions.ts`) using the `GITHUB_PERSONAL_ACCESS_TOKEN` secret, locked to the fixed site repo and the history repo, because the user wants a permanent connection with no token typed in the browser; each ZIP update also saves a small JSON record (message, sha, changed files) to the history repo, while old versions are browsed straight from GitHub commits.