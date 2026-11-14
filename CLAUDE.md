# CLAUDE.md — argus-handbook

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); this file is the orientation an agent needs to change code safely.

## What this is

The **public docs site for the Argus suite**, served at https://docs.dragonhound.dev from Cloudflare Pages (project `argus-handbook`). A Next.js 16 **static export** (App Router, React 19, Tailwind v4, MDX) in `web/`. No server, no runtime config, no backend: every page is prerendered at build time and the output is plain files in `web/out/`.

It holds the pages that cover the whole suite rather than one UI. They used to live under `/docs` in argus-studio (smk762/argus-studio#170, #172) and moved here; Studio keeps only its captioning concept pages (`/docs/captioning/*`), next to the tool they explain, and links here for the rest.

- `/`: what the suite is, with links to both sections and the demo UIs.
- `/setup/…`: **Setup and services**: the overview, `moderation`, `which-services` (what each demo UI needs live), and one page per external service under `/setup/services/<id>`.
- `/packages/…`: **Packages**: each package's own README and `docs/*.md`, imported from its `dev` branch at a recorded commit (`/packages/<short>/` and `/packages/<short>/<slug>/`).
- `/wiki/` is **reserved** for the DeepWiki export (ai-code-auditor#8, section 3). It will be built into this site at build time from the private `smk762/argus-docs` bundle, which needs a read token in CI (a new secret). Nothing is there yet; don't put other pages under `/wiki/`. `smk762/argus-docs` is a different, private repo: never push to it or change it from here.

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/dev/SUITE.md

## Layout

Everything is under `web/`; the repo root holds only docs, `.dh-shared.json` and the workflows.

- `web/src/app/`: the routes. `layout.tsx` is the one shell (header, sidebar, breadcrumb, article, pager, "On this page", footer); `page.mdx` is the home page; `setup/**/page.mdx` are the hand-written pages; `packages/page.tsx`, `packages/[pkg]/page.tsx` and `packages/[pkg]/[slug]/page.tsx` render the imported docs (`generateStaticParams`, `dynamicParams = false`); `not-found.tsx`; `globals.css` (tokens).
- `web/src/content/services.ts`: the service registry. One entry per `/setup/services/<id>` page: who uses it, the env vars and flags each package reads, the official guides. The sidebar, the section index and each page's facts block (`<ServiceFacts id="…" />`) read it.
- `web/src/content/packages/<short>/` and `web/public/package-docs/<short>/`: **imported** package docs and the images they show. Written by `npm run docs:pull`, never by hand.
- `web/schema/docs.json`: the import record: per package, the `dev` commit, the version at it, the pages (file, slug, title), held files, and a sha256 of every imported file.
- `web/scripts/`: `package-docs.mjs` (pull/check), `package-docs-lib.mjs` (the package allowlists and pure helpers, shared with the renderer), `opsec.mjs` (the opsec rules), `csp.mjs` (post-build CSP), `check-links.mjs` (external links), `check-overflow.mjs` (390 px phone check).
- `web/src/lib/`: `packageDocs.ts` (the record as data, routes, links), `packageDocsRender.ts` (the remark pass over an imported doc: heading ids, link and image rewriting), `docsOpsec.ts`, `site.ts` (site and demo URLs), `pageMeta.ts`, `familyHost.ts`, `slug.ts`, `theme.ts`.
- `web/src/components/`: `SiteHeader`, `SiteFooter`, `ThemeToggle`, `Tooltip`, `ExternalLink`, `Markdown`, and `docs/` (`docsNav.ts`, `DocsSidebar`, `DocsBreadcrumb`, `DocsPager`, `DocsToc`, `PackageDoc`, `PackageIndex`, `ServiceFacts`). `src/mdx-components.tsx` styles MDX prose.
- `web/vendor/dh/`: the Dragonhound shared layer (tokens, theme script, strip, badge), vendored from dragonhound-site. `web/public/dh-theme.js` is a copy of `vendor/dh/dh-theme.js`.

## Commands

```bash
# from web/
npm ci
npm run dev            # next dev on :3000
npm run build          # static export to out/, then scripts/csp.mjs (per-page CSP + out/_headers)
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm test               # vitest: registries, renderer, links and anchors, opsec gate
npm run docs:check     # offline: the imported docs match schema/docs.json and pass opsec
npm run docs:pull      # network: re-import every package at its dev HEAD (or: npm run docs:pull -- lens)
npm run docs:links     # network: every external link on the handbook's own pages answers
npm run check:overflow # after build: every route at 390 px, both themes, no console/CSP errors (needs Playwright)

# from the repo root
node web/vendor/dh/sync-shared.mjs --check . --against https://dragonhound.dev/brand/v1/manifest.json --allow-outdated
```

`node`/`npm` may not be on the host's PATH. Run them in docker with a named volume over `node_modules`, e.g. from `web/`: `docker run --rm -e HOME=/tmp -v "$PWD":/app -v handbook-nm:/app/node_modules -w /app node:22.23.4-alpine sh -c "npm ci && npm test"`. Files docker writes are root-owned: `docker run --rm -v "$PWD":/app alpine chown -R $(id -u):$(id -g) /app` before git. `docs:pull` needs git (`apk add git` in alpine). The overflow check runs in `mcr.microsoft.com/playwright:v1.65.0-noble` with `npm i --no-save playwright@1.65.0` and `PLAYWRIGHT_MODULE=<that>/node_modules/playwright`.

## Conventions & gotchas

- **Never hand-edit imported docs** (`src/content/packages/**`, `public/package-docs/**`, `schema/docs.json`). `docs:check` and the tests fail on any byte that doesn't match the record. A wrong or stale page is fixed in the package's `dev` branch and pulled again (the daily `docs-drift.yml` does that and opens a `chore/docs-sync` PR). To add or drop a page, change that package's allowlist in `scripts/package-docs-lib.mjs` and pull. Agent and planning files (CLAUDE.md, AGENTS.md, TODO.md, `.claude/`) and lab notebooks are never imported.
- **Opsec: refuse, never redact.** `scripts/opsec.mjs` refuses private, CGNAT and link-local addresses, home-directory and host-mount paths (`/home/<user>`, `/mnt/…`), real email addresses, and any term on the private denylist (`DOCS_OPSEC_DENYLIST`, a CI secret, never committed; a hit reports the entry's number, never the term). It gates every hand-written page in the vitest suite and every imported file before `docs:pull` writes anything: one hit anywhere writes nothing. Fix the source (upstream for a package doc), or list the file under `held` for that package so its page links it on GitHub instead. Never paper over a hit by editing the copy here.
- **Host placeholders.** Write hosts as `<GPU_HOST>`, `<LAN_HOST>` or `<AGENT_HOST>`, and paths as container paths (`/data/…`, `/models`). Loopback, compose service names, RFC 5737 addresses and RFC 2606 example domains are fine.
- **Static export only** (`output: "export"`, `trailingSlash: true`, `images.unoptimized`). No server build, route handlers, middleware, `headers()`/`redirects()` in next.config, or runtime config. Redirects go in `public/_redirects`, headers in `scripts/csp.mjs`'s `HEADERS` (written to `out/_headers`), both read by Cloudflare Pages.
- **CSP is generated at build time** by `scripts/csp.mjs`: a `<meta>` CSP per page with the sha256 of each inline script and `<style>`, `default-src 'self'`, no third-party origins. The only script we add is the theme script, and it is external (`/dh-theme.js`, blocking, first in `<head>`, so the saved theme is on `<html>` before first paint). No `dangerouslySetInnerHTML`, no `rehype-raw` (react-markdown runs with `skipHtml`), no inline `<script>`, no remote images (the renderer drops them; a package's own images are vendored under `public/package-docs/`). `check:overflow` fails on any `securitypolicyviolation`.
- **Links.** Internal routes have no `/docs` prefix: `/setup/…`, `/packages/…`. Studio's tools and its captioning concept pages are absolute `https://studio.dragonhound.dev/…` links. Off-site links go through `ExternalLink`: a `*.dragonhound.dev` host opens in the same tab, anything else a new tab with `noopener noreferrer`. The renderer keeps a link to any imported doc on this site (its own package's or a sibling's) and sends other repo files to GitHub at the recorded commit; the tests check every emitted in-site link lands on a page and heading.
- **A new service page**: add an entry to `src/content/services.ts`, then `src/app/setup/services/<id>/page.mdx` with `pageMetadata` and `<ServiceFacts id="<id>" />`. The sidebar picks it up; `services.test.ts` checks the page exists and the entry is complete.
- **Theme.** Light and dark come from the `--dh-*` tokens; `globals.css` overrides only the accent and the stage inks (as Studio does). Text on a tint uses the `-ink` colour. The toggle is `[data-dh-theme-toggle]`, owned by `dh-theme.js` (the `dh-theme` cookie is shared across `*.dragonhound.dev`); React never writes the theme.
- **Never edit `web/vendor/dh/`.** Fixes go upstream to dragonhound-site's `shared/`; re-sync with its `sync-shared.mjs <this repo> --dest web/vendor/dh`, then re-copy `dh-theme.js` to `web/public/` (a test checks they match). CI's `dh-shared` job fails on a local edit.
- **The React Compiler lint rules are on.** A `set-state-in-effect` suppression is fine for an effect that only reads the DOM, with the reason beside it.
- **Modern Web Guidance.** Use Chrome's [modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) skill (enabled in `.claude/settings.json`): search it before writing UI, CSS or browser-API code in `web/`.

## Deploy

`deploy.yml` runs after CI succeeds on a push to `dev` (or by hand): it builds, creates the Pages project `argus-handbook` if it is missing (production branch `main`), runs `wrangler pages deploy out --branch main`, and smoke-checks `/`, `/setup/` and `/packages/lens/` on https://docs.dragonhound.dev, falling back to https://argus-handbook.pages.dev while the custom domain is not attached. It needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and skips the upload with a notice without them. The custom domain is attached to the Pages project by hand, once. Don't create or change Cloudflare resources or secrets from an agent session.

## Branches

`dev` is the default branch and the base for every PR. The one exception is a PR stacked on another open PR into `dev`: it targets that PR's branch, then is retargeted to `dev` once its parent merges. Never open a PR against `main` or push to it directly. `main` only moves by fast-forwarding to `dev` (`git push origin origin/dev:main`), so it stays an ancestor of `dev`. A branch cut from `main` must be rebased or merged onto `origin/dev`, never the other way round. The site deploys from `dev`, so `main` marks releases only.

## CI

`ci.yml` gates every PR and every push to `dev` and `main`: `npm ci`, `docs:check`, lint, typecheck, `npm test` (both with `DOCS_OPSEC_DENYLIST`), the static build plus `check:overflow`, and the `dh-shared` drift check. `suite.yml` (argus-ci's `suite-check`) fails if the argus-suite block above or this repo's SUITE.md row goes missing. `docs-drift.yml` (daily) re-imports package docs when a `dev` branch moved and opens or updates a `chore/docs-sync` PR, or an issue when the opsec gate refuses. `docs-links.yml` (weekly) checks external links and opens or comments on one issue. Before tagging a release, move the entries in `CHANGELOG.md` into a dated section, bump `web/package.json` (and the two root `version` fields in `web/package-lock.json`), and update this repo's row in argus-cortex's SUITE.md if the release changed what the site covers.
