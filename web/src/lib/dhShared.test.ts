import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("dh-shared adoption", () => {
  it("serves the vendored theme script unchanged (re-copy vendor/dh/dh-theme.js to public/ after a sync)", () => {
    expect(read("public/dh-theme.js")).toBe(read("vendor/dh/dh-theme.js"));
  });
});
