# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- argus-scout under `/packages/scout/`: its README and `docs/*.md` (config, sources, signals, narrative, channels, API, operations, CLI), with a home-page entry.
- Immich: a "Remote machine learning on the GPU host" section (#15). It covers a minimal compose for the CUDA `immich-machine-learning` server, `MACHINE_LEARNING_MODEL_TTL`, the ML URL list with a CPU fallback (and what fails without one), and the Rich-logging startup hang with its `log_conf.json` workaround, which applies only up to v3.3.x. The GPU host's "Sharing one GPU" now covers immich-ml, which doesn't take part in the lease (iris support: smk762/argus-iris#29).

### Fixed

- Link previews: every page now has a 1200×630 card image (`web/src/app/opengraph-image.tsx`, drawn at build time and served as `image/png`) and a `summary_large_image` card. The home page's title no longer repeats the site name ("Argus docs · Argus docs"), and pages keep the site name and type in their Open Graph tags.

## [0.1.0] - 2026-11-20

### Added

- argus-mint, argus-survey and argus-mask under `/packages/` (#5): each README, `docs/*.md` and design doc (survey's `SPEC.md`, mask's `spec.md`), with home-page entries linking their demos (Assay, Sightline, Mask).
- An inbound-link check (`npm run check:inbound`, in CI after the build). `web/schema/inbound.json` lists the handbook pages and `#anchors` that other repos link to: Studio's concept pages and redirects, and the UI READMEs' `which-services` anchors. CI fails if the static export no longer has one, so a synced doc that renames a heading can't silently break them.
- argus-quarry's and argus-forge's READMEs, no longer held: their host mount paths were replaced upstream (smk762/argus-quarry#36, smk762/argus-forge#39).
- The site: a Next.js static export in `web/`, served at https://docs.dragonhound.dev. Moved from argus-studio's `/docs` (smk762/argus-studio#170, #172), with the `/docs` prefix dropped:
  - **Setup and services** (`/setup/`): the overview, moderation, what to run for which UI, and one page per external service, from the service registry (`web/src/content/services.ts`).
  - **Packages** (`/packages/`): each package's README and `docs/` pages, imported from its `dev` branch at a recorded commit by `npm run docs:pull`, held to the record by `npm run docs:check`, and gated by the docs opsec check.
  - A home page for the suite, and a `/packages/` index with each package's version and commit.
- The docs shell: header (Argus mark, links to the demo UIs, theme toggle), sidebar, breadcrumb, prev/next, "On this page", footer, light and dark themes from the vendored Dragonhound shared layer (`web/vendor/dh`, dh-shared 1.2.1).
- A hash-based CSP on every page and an `_headers` file for Cloudflare Pages (`web/scripts/csp.mjs`), and `_redirects` from Studio's old `/docs/setup/*` and `/docs/packages/*` paths.
- CI (`ci.yml`): docs check, lint, typecheck, tests with the opsec denylist, the static build, a 390 px phone check over every route in both themes, and the dh-shared drift check. `deploy.yml` (Cloudflare Pages, creates the project when missing), `docs-drift.yml` (daily package docs sync PR), `docs-links.yml` (weekly external link check) and `suite.yml` (argus-ci suite check).

### Fixed

- Package pages' canonical and Open Graph URLs named `/docs/packages/…`, which does not exist; they now name `/packages/…`.
- Imported package docs: a reference-style image (`![CI][badge]`) is dropped like an inline badge, or loads from the vendored copy when it is the package's own; a malformed `%` escape in a doc's link no longer fails the build, and a root-relative link is decoded like a relative one; GFM footnote references and back-links land (their `id`s are kept); an ordered list keeps its `start` number.
- Hand-written pages: two `##`/`###` headings with the same text get distinct ids (`usage`, `usage-1`), set at compile time by `web/scripts/remark-heading-ids.mjs`.
- The opsec gate fails in GitHub Actions when `DOCS_OPSEC_DENYLIST` is unset or empty (a fork or Dependabot run, a renamed secret) instead of passing without the private denylist.
- Package docs synced to every `dev` HEAD again (#6): the LAN host name the opsec gate refused was replaced upstream (smk762/argus-lens#127, smk762/argus-curator#178, smk762/argus-proof#95, smk762/argus-cortex#119, smk762/argus-mask#140).
- A link in a package doc's table no longer widens the page on a phone: the table's scroll wrapper is now positioned, so the link's visually hidden "(opens in new tab)" text stays inside it.
- A theme choice survives a browser that blocks cookies (#11): the vendored Dragonhound shared layer is re-synced to dh-shared 1.2.10, which falls back to `localStorage`.

[Unreleased]: https://github.com/smk762/argus-handbook/compare/v0.1.0...dev
[0.1.0]: https://github.com/smk762/argus-handbook/releases/tag/v0.1.0
