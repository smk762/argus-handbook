// Checks the links other repos make into the handbook (schema/inbound.json)
// against the static export: each page must exist in out/ and each #anchor must
// be an element id on it. Run by CI after `npm run build`, so a docs sync that
// renames a heading, or a moved page, fails its PR instead of breaking a
// README or a Studio concept page.
//
//   node scripts/check-inbound.mjs [out-dir]   (npm run check:inbound)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, process.argv[2] ?? "out");
const { links } = JSON.parse(readFileSync(join(ROOT, "schema/inbound.json"), "utf8"));

const pages = new Map();
function idsOf(path) {
  if (!pages.has(path)) {
    const file = join(OUT, path, "index.html");
    pages.set(path, existsSync(file) ? new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])) : null);
  }
  return pages.get(path);
}

const problems = [];
for (const { path: href, from } of links) {
  const [path, anchor] = href.split("#");
  const ids = idsOf(path);
  if (!ids) problems.push(`${href}: no page at ${path} (linked from ${from.join(", ")})`);
  else if (anchor && !ids.has(anchor)) problems.push(`${href}: no #${anchor} on ${path} (linked from ${from.join(", ")})`);
}

console.log(`checked ${links.length} inbound links`);
for (const p of problems) console.log(`BROKEN ${p}`);
process.exit(problems.length ? 1 : 0);
