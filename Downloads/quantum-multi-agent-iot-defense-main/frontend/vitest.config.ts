import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"] },
});
