import { defineConfig } from "@playwright/test";

/**
 * The rendering harness. See `test/harness/harness.ts` for why it exists.
 *
 * Chromium only, headless, one worker. This is a correctness gate on a solo
 * project, not a cross-browser matrix — breadth here would cost minutes per
 * run and catch nothing the phone layout is currently getting wrong.
 */

const PORT = 3100;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./test/harness",
  testMatch: /.*\.harness\.ts$/,

  // Layout assertions read shared page geometry; parallelism buys nothing and
  // makes a failure harder to reproduce.
  fullyParallel: false,
  workers: 1,

  // A flaky-passing layout assertion is worse than none: it would re-teach the
  // habit this harness exists to break.
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  outputDir: "./test-results",

  use: {
    baseURL: ORIGIN,
    // Required by task 1: a picture of the page at the moment an assertion
    // failed. Written next to the failing test under `outputDir`.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Deterministic geometry: no device pixel ratio surprises between the
    // developer's machine and CI.
    deviceScaleFactor: 1,
  },

  projects: [{ name: "chromium", use: { browserName: "chromium" } }],

  webServer: {
    // Builds before serving on purpose. `next dev` compiles per-request and
    // tolerates things a production build rejects, and a stale `.next` from an
    // earlier run would let the harness pass against code that no longer
    // exists. The build is a few seconds; a false green is not.
    command: `pnpm run build && pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    url: `${ORIGIN}/discovery`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
