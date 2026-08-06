import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15_000,
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
});
