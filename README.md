# argus-handbook

Public docs for the [Argus suite](https://github.com/smk762/argus-cortex/blob/dev/SUITE.md), served at **https://docs.dragonhound.dev**.

- **Setup and services** (`/setup/`): the external services the Argus packages depend on (GPU host, ComfyUI, Ollama, vLLM, NudeNet, SingGuard, model downloads, …), who uses each one and how to set it up; how moderation fits together; and what each demo UI needs live.
- **Packages** (`/packages/`): each package's own README and `docs/` pages, imported from its `dev` branch at a recorded commit.

The demo UIs are separate sites: [Studio](https://studio.dragonhound.dev/), [Lightbox](https://lightbox.dragonhound.dev/) and [Realms](https://realms.dragonhound.dev/). These pages used to live under Studio's `/docs`; its captioning concept pages stay there, next to the tool.

## Local development

The site is a Next.js static export in `web/`. You need Node 22.

```bash
cd web
npm ci
npm run dev        # http://localhost:3000
npm run build      # static site in web/out/, with a per-page CSP and out/_headers
npx serve out      # look at the built site
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000. |
| `npm run build` | Static export to `out/`, then `scripts/csp.mjs` adds a hash-based CSP to every page and writes `out/_headers`. |
| `npm run lint` / `npm run typecheck` | ESLint, `tsc --noEmit`. |
| `npm test` | Vitest: the service and package registries, the doc renderer, every in-site link and anchor, and the opsec gate over every page. |
| `npm run docs:check` | Offline: the imported package docs match `schema/docs.json` and pass the opsec gate. |
| `npm run docs:pull` | Network: re-import every package's docs at its `dev` HEAD (`npm run docs:pull -- lens` for one). |
| `npm run docs:links` | Network: every external link on the handbook's own pages still answers. |
| `npm run check:overflow` | After a build: every route at 390 px in light and dark, no sideways scroll, console errors or CSP violations. Needs Playwright (`npm i --no-save playwright@1.65.0 && npx playwright install chromium`). |

## How a package's docs get here

Each package has an allowlist in `web/scripts/package-docs-lib.mjs`: its README, its `docs/*.md` pages, and a top-level design doc where it keeps one. `npm run docs:pull` clones each package's `dev` branch, runs every file through the opsec gate (private addresses, home and host-mount paths, real emails, a private denylist), and only if all of them pass writes them to `web/src/content/packages/<short>/` (with the images they show under `web/public/package-docs/<short>/`) and records the commit, version and a sha256 per file in `web/schema/docs.json`.

The copies here are never edited by hand. To fix a page, fix it in the package's `dev` branch; the daily **Package docs drift** workflow re-imports it and opens a `chore/docs-sync` PR (or an issue, if the opsec gate refuses something). A file that fails the gate can be listed under `held`: its package page then links it on GitHub instead.

To add a package, add an entry to `PACKAGES` in `package-docs-lib.mjs` and run `npm run docs:pull -- <short>`.

## How to add a service page

1. Add an entry to `web/src/content/services.ts`: `id`, `title`, a short `summary`, `usedBy` (each package, what for, and the env vars or flags it reads) and the official `guides`.
2. Create `web/src/app/setup/services/<id>/page.mdx` with its `pageMetadata` and `<ServiceFacts id="<id>" />`, plus any setup prose around it.
3. Write hosts as `<GPU_HOST>` or `<LAN_HOST>`, never a real address. `npm test` checks the page exists, the entry is complete, and the page passes the opsec gate.

The sidebar and the services index pick the new page up from the registry.

## Deploy

Every commit to `dev` that passes CI is deployed to the Cloudflare Pages project `argus-handbook` (`.github/workflows/deploy.yml`), which serves docs.dragonhound.dev. The workflow needs the repo secrets `CLOUDFLARE_API_TOKEN` (Account > Cloudflare Pages > Edit) and `CLOUDFLARE_ACCOUNT_ID`; CI and the drift job also use `DOCS_OPSEC_DENYLIST`.

## License

[MIT](LICENSE)
