import { configDefaults, defineConfig } from "vitest/config";

/**
 * Drops this checkout's test database when the run ends (kept on a failed
 * run only with KEEP_TEST_DB_ON_FAILURE=1). On both projects: each has
 * DB-backed files, and `--project dom` alone must still clean up. Two
 * teardowns in one run are harmless; the second drop finds nothing.
 */
const TEST_DATABASE_TEARDOWN = "./test/vitest-global-setup.ts";

/**
 * Two projects, because this package has two genuinely different kinds of test
 * and one environment cannot serve both.
 *
 * `api` talks to a real Postgres over a socket and stays in Node - a DOM would
 * add globals it does not want and cannot benefit from.
 *
 * `dom` is new. Until it existed, a React component in this repository could
 * not be tested at all: every test in the repo ran in Node, so the only thing
 * anyone could assert about a component was that its markup contained a
 * string. That is precisely the check that let the M5 layout defects through.
 *
 * happy-dom rather than jsdom: lighter, and nothing here needs jsdom's heavier
 * CSS and navigation emulation. Know the limit that comes with it - happy-dom
 * does no layout, so `getBoundingClientRect` is all zeros and computed styles
 * are the inline ones. Anything that needs a real browser (pointer events, the
 * tab order, a photo that decodes) belongs in the Playwright harness under
 * `test/harness`, not here.
 *
 * `dom` therefore claims everything `api` does not, rather than only
 * `src/features`. Two narrow globs would leave the rest of `src` matched by no
 * project at all, and a test file added there would not fail - it would simply
 * never run, which is the same silent green this whole branch exists to remove.
 */
/** Resolved with the `browser` condition so `@sentry/nextjs` is its client build, as in a page. */
const BROWSER_SDK_TESTS = "src/observability/client-*.test.ts";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "api",
          environment: "node",
          /**
           * `src/proxy.test.ts` joins this project, not `dom`, even though
           * `proxy.ts` lives outside `src/api` - it constructs real
           * `NextRequest`/`Headers` objects, and happy-dom's own DOM-shimmed
           * globals silently produced a `Headers` that couldn't be read back
           * (`cookie` came back empty even though the same construction
           * worked correctly under plain Node) - found by a test that should
           * have passed failing for the wrong reason, not by inspection.
           * `proxy.ts` runs in the Node.js runtime in production anyway (its
           * own comment explains why), so `node` is also the accurate
           * environment to test it under, not merely the one that works.
           */
          // `src/kabinet` too: it handles real `Request`s through Better Auth,
          // the same happy-dom `Headers` problem `proxy.test.ts` hit.
          include: ["src/api/**/*.test.ts", "src/kabinet/**/*.test.ts", "src/proxy.test.ts"],
          testTimeout: 15_000,
          fileParallelism: false,
          // setupTestDatabase can wait up to the maintenance lock wait (25 s) before it creates and
          // migrates; vitest's 10 s default cut that wait off. Pinned by test-database-teardown.test.ts.
          hookTimeout: 60_000,
          globalSetup: [TEST_DATABASE_TEARDOWN],
        },
      },
      {
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: [
            ...configDefaults.exclude,
            "src/api/**",
            "src/kabinet/**",
            "src/proxy.test.ts",
            BROWSER_SDK_TESTS,
          ],
          setupFiles: ["./test/setup-dom.ts"],
          // Most files here are pure component tests with no DB. A growing
          // minority (src/app/page.test.tsx, src/app/tvaryny/page.test.tsx)
          // call createTestHarness() against this checkout's real test
          // database (opika_test_<hash>, packages/db/src/test-utils/test-database.ts), the same DROP SCHEMA CASCADE + migrate cycle
          // src/api's files do - which is exactly why *that* project sets
          // this flag. `dom` didn't need it back when it had zero DB-backed
          // files; now that it has two, they raced: one file's setup
          // dropped `drizzle.__drizzle_migrations` out from under the
          // other's still-running test, observed as "relation does not
          // exist". Serialising the whole project is coarser than only
          // serialising the DB-backed files, but simpler than a third
          // project, and this suite is fast enough that the cost is real
          // but small.
          fileParallelism: false,
          // setupTestDatabase can wait up to the maintenance lock wait (25 s) before it creates and
          // migrates; vitest's 10 s default cut that wait off. Pinned by test-database-teardown.test.ts.
          hookTimeout: 60_000,
          globalSetup: [TEST_DATABASE_TEARDOWN],
        },
      },
      {
        resolve: { conditions: ["browser", "module", "import", "default"] },
        ssr: { resolve: { conditions: ["browser", "module", "import", "default"] } },
        test: {
          name: "browser-sdk",
          environment: "happy-dom",
          include: [BROWSER_SDK_TESTS],
          server: { deps: { inline: [/@sentry/] } },
          setupFiles: ["./test/setup-dom.ts"],
        },
      },
    ],
  },
});
