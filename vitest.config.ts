import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-logic unit tests (no DOM, no Firebase calls). See docs/ROADMAP.md P0#2.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
