import { Children, isValidElement, type ReactNode } from "react";

import { slugify as slugifyText } from "../../scripts/remark-heading-ids.mjs";

/**
 * GitHub-style slug: lower-case, spaces to hyphens, punctuation stripped. The
 * one implementation lives in scripts/remark-heading-ids.mjs, which also gives
 * the MDX pages' `##`/`###` de-duplicated ids at compile time (`usage`, `usage-1`).
 */
export function slugify(text: string): string {
  return slugifyText(text);
}

/**
 * Flatten a React node to its visible text — enough to slug a heading whose
 * children may include inline `<code>`/emphasis, not just a bare string. Used
 * to give MDX headings stable ids that the on-page TOC can anchor to, without
 * pulling in a rehype plugin (Turbopack serialises those as module names only).
 */
export function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    return nodeText((node.props as { children?: ReactNode }).children);
  }
  return Children.toArray(node).map(nodeText).join("");
}
