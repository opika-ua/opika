import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15_000,
    fileParallelism: false,
    // Drops this checkout's test database when the run ends (kept on a
    // failed run only with KEEP_TEST_DB_ON_FAILURE=1).
    globalSetup: ["./src/test-utils/vitest-global-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/**/*.test.ts", "src/test-utils/**"],
    },
  },
});
