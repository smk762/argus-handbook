import { describe, expect, it } from "vitest";

import remarkHeadingIds, { uniqueSlugger } from "../../scripts/remark-heading-ids.mjs";
import { slugify } from "./slug";

describe("the MDX pages' heading ids", () => {
  const ids = async (markdown: string) => {
    const [{ unified }, { default: remarkParse }] = await Promise.all([import("unified"), import("remark-parse")]);
    const processor = unified().use(remarkParse).use(remarkHeadingIds);
    const tree = (await processor.run(processor.parse(markdown))) as unknown as {
      children: { type: string; depth?: number; data?: { hProperties?: { id?: string } } }[];
    };
    return tree.children.filter((node) => node.type === "heading").map((node) => node.data?.hProperties?.id);
  };

  it("are unique on a page, a repeat numbered across h2 and h3 alike", async () => {
    expect(await ids("## Setup\n\n### Usage\n\n## More\n\n### Usage\n\n## Usage\n")).toEqual([
      "setup",
      "usage",
      "more",
      "usage-1",
      "usage-2",
    ]);
  });

  it("are the slug of the heading's text, inline code included, and only on h2 and h3", async () => {
    expect(await ids("# Title\n\n## The `--dry-run` flag\n\n#### Deep\n")).toEqual([undefined, "the-dry-run-flag", undefined]);
  });

  it("skip an id a literal heading already took", () => {
    const slug = uniqueSlugger();
    expect(["Usage 1", "Usage", "Usage"].map(slug)).toEqual(["usage-1", "usage", "usage-2"]);
  });

  it("match slugify, which the JSX fallback uses", () => {
    expect(slugify("  概要 — Notes!  ")).toBe("概要-notes");
  });
});
