# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The site: a Next.js static export in `web/`, served at https://docs.dragonhound.dev. Moved from argus-studio's `/docs` (smk762/argus-studio#170, #172), with the `/docs` prefix dropped:
  - **Setup and services** (`/setup/`): the overview, moderation, what to run for which UI, and one page per external service, from the service registry (`web/src/content/services.ts`).
  - **Packages** (`/packages/`): each package's README and `docs/` pages, imported from its `dev` branch at a recorded commit by `npm run docs:pull`, held to the record by `npm run docs:check`, and gated by the docs opsec check.
  - A home page for the suite, and a `/packages/` index with each package's version and commit.
- The docs shell: header (Argus mark, links to the demo UIs, theme toggle), sidebar, breadcrumb, prev/next, "On this page", footer, light and dark themes from the vendored Dragonhound shared layer (`web/vendor/dh`, dh-shared 1.2.1).
- A hash-based CSP on every page and an `_headers` file for Cloudflare Pages (`web/scripts/csp.mjs`), and `_redirects` from Studio's old `/docs/setup/*` and `/docs/packages/*` paths.
- CI (`ci.yml`): docs check, lint, typecheck, tests with the opsec denylist, the static build, a 390 px phone check over every route in both themes, and the dh-shared drift check. `deploy.yml` (Cloudflare Pages, creates the project when missing), `docs-drift.yml` (daily package docs sync PR), `docs-links.yml` (weekly external link check) and `suite.yml` (argus-ci suite check).
