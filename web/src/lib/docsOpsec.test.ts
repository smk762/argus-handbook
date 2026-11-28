import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { gateDenylist, opsecFindings, parseDenylist } from "./docsOpsec";

describe("opsecFindings", () => {
  it("passes placeholders, loopback and container paths", () => {
    const ok = [
      "COMFYUI_URL=http://<GPU_HOST>:8188",
      "curl http://localhost:8101/health and http://127.0.0.1:11434",
      "mount the models at /data/models or ~/models",
      "the doc range 192.0.2.10 and version 10.4.1",
    ].join("\n");
    expect(opsecFindings(ok)).toEqual([]);
  });

  it("refuses private, CGNAT and link-local addresses", () => {
    const rules = opsecFindings("10.0.0.5 172.20.1.1 192.168.200.20 100.70.0.1 169.254.1.1 fe80::1 fd12:3456::1").map(
      (f) => f.rule,
    );
    expect(rules).toEqual(["private-ip", "private-ip", "private-ip", "private-ip", "link-local", "private-ip", "link-local"]);
  });

  it("refuses home and host-mount paths and emails, with the line", () => {
    const found = opsecFindings("ok\nsee /home/alice/models\n(/mnt/nas/photos)\nmail someone@realmail.net");
    expect(found.map((f) => [f.rule, f.line])).toEqual([
      ["home-path", 2],
      ["server-path", 3],
      ["email", 4],
    ]);
  });

  it("lets reserved example domains through (RFC 2606 / 6761)", () => {
    const text = "UA argus-quarry/0.1 (you@example.com), a@b.example.org, c@host.test, d@x.invalid, e@localhost.localhost";
    expect(opsecFindings(text)).toEqual([]);
    expect(opsecFindings("f@notexample.com").map((x) => x.rule)).toEqual(["email"]);
  });

  it("reports a denylist hit without echoing the term", () => {
    const found = opsecFindings("the Secret-Host box", parseDenylist(" secret-host ,\n\n"));
    expect(found).toEqual([{ rule: "denylist", match: "denylist entry #1", line: 1 }]);
  });
});

describe("gateDenylist", () => {
  it("refuses to run without the denylist in GitHub Actions", () => {
    expect(() => gateDenylist({ GITHUB_ACTIONS: "true", CI: "true" })).toThrow(/DOCS_OPSEC_DENYLIST/);
    expect(() => gateDenylist({ GITHUB_ACTIONS: "true", DOCS_OPSEC_DENYLIST: " ,\n" })).toThrow(/DOCS_OPSEC_DENYLIST/);
  });

  it("returns the parsed list there, and allows an empty one elsewhere", () => {
    expect(gateDenylist({ GITHUB_ACTIONS: "true", DOCS_OPSEC_DENYLIST: "a, b" })).toEqual(["a", "b"]);
    expect(gateDenylist({})).toEqual([]);
    expect(gateDenylist({ CI: "true" })).toEqual([]);
  });
});

// The gate itself: every published docs source must pass, the package docs
// imported under src/content/packages included. CI supplies the
// private denylist as the DOCS_OPSEC_DENYLIST secret, and the gate fails in
// GitHub Actions without it (gateDenylist), rather than passing on an empty list.
const ROOT = join(__dirname, "..");
const PUBLISHED = [join(ROOT, "app"), join(ROOT, "content")];

/**
 * Whether the gate reads a file: every file under a published tree, so a `.js`, `.json`, `.yaml`, `.txt` or `.svg`
 * can't carry an address past it, except tests and binary assets (images, icons, fonts), which hold no text.
 */
export function gated(name: string): boolean {
  return !/\.test\.[cm]?[jt]sx?$/.test(name) && !/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i.test(name);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return gated(name) ? [p] : [];
  });
}

// Audit pack-argus-handbook-58360036b3: the gate reads every text file, not four extensions.
describe("gated", () => {
  it("reads every text source and skips only tests and binary assets", () => {
    for (const name of ["page.mdx", "a.md", "x.ts", "y.tsx", "route.js", "c.jsx", "data.json", "nav.yaml", "nav.yml", "snippet.txt", ".env.example", "icon.svg", "globals.css"]) {
      expect(gated(name), name).toBe(true);
    }
    for (const name of ["docsOpsec.test.ts", "Nav.test.tsx", "logo.png", "photo.JPG", "favicon.ico", "font.woff2"]) {
      expect(gated(name), name).toBe(false);
    }
  });
});

describe("published docs opsec gate", () => {
  // Read inside the tests, so a missing secret in GitHub Actions fails them rather than the file's collection.
  let cached: string[] | undefined;
  const denylist = () => (cached ??= gateDenylist());
  it("has the private denylist when running in GitHub Actions", () => {
    const list = denylist();
    if (process.env.GITHUB_ACTIONS === "true") expect(list.length).toBeGreaterThan(0);
  });
  for (const file of PUBLISHED.flatMap(files)) {
    it(relative(ROOT, file), () => {
      expect(opsecFindings(readFileSync(file, "utf8"), denylist())).toEqual([]);
    });
  }
});
