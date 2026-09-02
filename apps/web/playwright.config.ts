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

/**
 * Reused, not a dedicated harness database. `opika_test` is the only
 * database CI's Postgres service (.github/workflows/ci.yml) provisions, and
 * `pnpm check`'s own order — test -> build:web -> test:harness — means
 * vitest's own DROP SCHEMA CASCADE (packages/db/src/test-utils/setup.ts)
 * and this harness's migrate+seed never run at the same time in CI. Locally
 * the same holds unless a `test --watch` is left running in another
 * terminal while the harness starts, which is on the developer, not
 * something this config can prevent without a second provisioned database.
 *
 * Not `apps/web`'s own `getDb()` default (`DATABASE_URL` unset in dev) —
 * this always points at the same place vitest's DB tests already assume
 * exists, so both tools agree on where "the local Postgres" is.
 */
const HARNESS_DATABASE_URL = "postgres://opika:opika@127.0.0.1:5433/opika_test";

/** Same literal apps/web/src/api/test-harness.ts uses — recognizable as the test secret, not a real one. */
const CURSOR_HMAC_SECRET = "test-hmac-secret-for-cursor-signing";

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
    //
    // migrate then seed, ahead of `next start`: gallery-layout.harness.ts
    // needs real rows behind `/tvaryny` to count columns per row, and
    // db:seed's own safety gate truncates first (packages/db/src/seed.ts),
    // so this is idempotent across repeated harness runs rather than
    // accumulating duplicate rows. `--filter @opika/db`, not a relative
    // `cd`, so this command stays correct regardless of which directory
    // Playwright resolves it from.
    command: [
      "pnpm run build",
      "pnpm --filter @opika/db run db:migrate",
      "pnpm --filter @opika/db run db:seed",
      `pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    ].join(" && "),
    // Was /discovery, retired by E5 (next.config.ts now redirects it to
    // /tvaryny/gortaty) — /tvaryny is the real front door and needs no
    // redirect hop to confirm the server is actually serving pages.
    url: `${ORIGIN}/tvaryny`,
    // Not `!process.env.CI`, which is the usual idiom. Reusing a server that
    // an aborted run left behind on :3100 would grade the build that server
    // started with — the same stale-artefact false green the comment above
    // rejects, just arriving locally instead of in CI. A loud "port in use"
    // costs seconds; a green run against code that no longer exists is what
    // this whole harness was written to stop.
    reuseExistingServer: false,
    // Was 180s for build+start alone; migrate+seed (300+ animals) add real
    // time on top, so this needs slack rather than the same number carried
    // forward unchanged.
    timeout: 240_000,
    env: {
      DATABASE_URL: HARNESS_DATABASE_URL,
      CURSOR_HMAC_SECRET,
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
