// Heading ids for the hand-written MDX pages, set at compile time (next.config's
// remarkPlugins, by path: Turbopack takes plugins as module names). Each `##`
// and `###` gets the slug of its text (src/lib/slug.ts re-exports `slugify`),
// numbered GitHub's way when it repeats on the page: `usage`, `usage-1`, ... so
// no two headings share an id and every TOC entry and `#anchor` reaches its own.

/**
 * GitHub-style slug: lower-case, spaces to hyphens, punctuation stripped.
 * Keeps Unicode letters and digits, so `## 概要` yields a real anchor.
 * @param {string} text
 */
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A per-page slugger: a repeat gets `-1`, `-2`, ... skipping any id already taken. */
export function uniqueSlugger() {
  const taken = new Set();
  return (/** @type {string} */ text) => {
    const base = slugify(text);
    let id = base;
    for (let n = 1; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  };
}

/** @param {any} node */
const textOf = (node) =>
  typeof node.value === "string" && node.type !== "mdxjsEsm" && node.type !== "mdxFlowExpression" && node.type !== "mdxTextExpression"
    ? node.value
    : Array.isArray(node.children)
      ? node.children.map(textOf).join("")
      : "";

/** @param {any} node @param {(node: any) => void} visit */
function walk(node, visit) {
  visit(node);
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, visit);
}

export default function remarkHeadingIds() {
  return (/** @type {any} */ tree) => {
    const slug = uniqueSlugger();
    walk(tree, (node) => {
      if (node.type !== "heading" || (node.depth !== 2 && node.depth !== 3)) return;
      const id = slug(textOf(node));
      if (id) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
    });
  };
}
