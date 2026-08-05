import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/**/*.test.ts"],
      /**
       * The milestone's definition of done names a coverage floor for the
       * verification machine and the freshness functions. Enforcing it here
       * means the number is a build failure rather than a claim in a document.
       */
      thresholds: {
        "src/shelters/verification/*.ts": { statements: 90, branches: 80, functions: 90 },
        "src/discovery/freshness.ts": { statements: 90, branches: 80, functions: 90 },
      },
    },
  },
});
