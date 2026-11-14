import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for src/lib and src/content: the package-docs registry and renderer,
// the service registry and the docs opsec gate. Node environment: components
// are rendered to static markup (react-dom/server), never mounted in a DOM.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
