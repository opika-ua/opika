import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15_000,
    // setupTestDatabase can wait up to the maintenance lock wait (25 s) before it creates and
    // migrates; vitest's 10 s default cut that wait off. Pinned by test-database-teardown.test.ts.
    hookTimeout: 60_000,
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
