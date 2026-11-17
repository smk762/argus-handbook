import { join } from "node:path";

import createMDX from "@next/mdx";
import type { NextConfig } from "next";

// A static export and nothing else: `npm run build` writes out/ (then
// scripts/csp.mjs hashes each page's inline scripts into a <meta> CSP and
// writes out/_headers), and Cloudflare Pages serves it at docs.dragonhound.dev.
// No server, no runtime config, no image optimizer.
const nextConfig: NextConfig = {
  output: "export",
  // Pages serves `/setup/index.html` for `/setup/` and redirects the bare
  // path, so emit directories rather than `setup.html` files.
  trailingSlash: true,
  images: { unoptimized: true },
  // Let `.mdx` files be treated as routes/pages alongside TS/TSX.
  pageExtensions: ["ts", "tsx", "mdx"],
};

const withMDX = createMDX({
  // Turbopack serializes this config, so remark/rehype plugins must be given
  // as string module names (with optional options), not imported functions.
  options: {
    // remark-heading-ids gives each `##`/`###` a unique id (repeats numbered).
    // An absolute path: the loader's project root is not web/ under Turbopack.
    remarkPlugins: [["remark-gfm", {}], [join(process.cwd(), "scripts", "remark-heading-ids.mjs"), {}]],
  },
});

export default withMDX(nextConfig);
