import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

// public/dh-theme.js run in a minimal fake browser (node environment, no DOM): enough
// document/window for the theme logic, with a cookie jar that can refuse every write.
const SCRIPT = readFileSync(join(process.cwd(), "public/dh-theme.js"), "utf8");

type Listener = (e: { type: string; persisted?: boolean; detail?: unknown }) => void;

function boot({ cookiesBlocked, storage }: { cookiesBlocked: boolean; storage: Map<string, string> }) {
  const on: Record<string, Listener[]> = {};
  const listen = (type: string, fn: Listener) => (on[type] ??= []).push(fn);
  const fire = (type: string, extra = {}) => (on[type] ?? []).forEach((fn) => fn({ type, ...extra }));
  let jar = "";
  const root = { dataset: {} as Record<string, string>, hasAttribute: () => false, getAttribute: () => null };
  const document = {
    documentElement: root,
    readyState: "complete",
    visibilityState: "visible",
    get cookie() {
      return jar;
    },
    set cookie(v: string) {
      if (!cookiesBlocked) jar = v.split(";")[0];
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: listen,
    removeEventListener: () => {},
    dispatchEvent: (e: { type: string }) => fire(e.type, e),
  };
  const ctx: Record<string, unknown> = {
    document,
    location: { hostname: "handbook.example", protocol: "https:" },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }), // system scheme: light
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    addEventListener: listen,
    CustomEvent: class {
      constructor(
        public type: string,
        init: { detail?: unknown },
      ) {
        Object.assign(this, init);
      }
    },
    Element: class {},
    MutationObserver: class {
      observe() {}
    },
  };
  ctx.window = ctx;
  runInContext(SCRIPT, createContext(ctx));
  const api = ctx.dhTheme as { get(): string | null; set(t: string | null): void };
  return { api, fire };
}

describe("dh-theme with cookies that can't be stored", () => {
  it("keeps the toggled theme when the tab becomes visible again", () => {
    const page = boot({ cookiesBlocked: true, storage: new Map() });
    page.api.set("dark");
    expect(page.api.get()).toBe("dark");

    page.fire("visibilitychange");
    page.fire("pageshow", { persisted: true });
    expect(page.api.get()).toBe("dark");
  });

  it("keeps the choice across a reload through the localStorage fallback", () => {
    const storage = new Map<string, string>();
    boot({ cookiesBlocked: true, storage }).api.set("dark");
    expect(boot({ cookiesBlocked: true, storage }).api.get()).toBe("dark");
  });

  it("still follows a cookie another subdomain changed when cookies work", () => {
    const page = boot({ cookiesBlocked: false, storage: new Map() });
    page.api.set("dark");
    page.fire("visibilitychange");
    expect(page.api.get()).toBe("dark");
  });
});
