import { configDefaults, defineConfig } from "vitest/config";

/**
 * Two projects, because this package has two genuinely different kinds of test
 * and one environment cannot serve both.
 *
 * `api` talks to a real Postgres over a socket and stays in Node — a DOM would
 * add globals it does not want and cannot benefit from.
 *
 * `dom` is new. Until it existed, a React component in this repository could
 * not be tested at all: every test in the repo ran in Node, so the only thing
 * anyone could assert about a component was that its markup contained a
 * string. That is precisely the check that let the M5 layout defects through.
 *
 * happy-dom rather than jsdom: lighter, and nothing here needs jsdom's heavier
 * CSS and navigation emulation. Know the limit that comes with it — happy-dom
 * does no layout, so `getBoundingClientRect` is all zeros and computed styles
 * are the inline ones. Anything that depends on real geometry belongs in the
 * Playwright harness under `test/harness`, not here.
 *
 * `dom` therefore claims everything `api` does not, rather than only
 * `src/features`. Two narrow globs would leave the rest of `src` matched by no
 * project at all, and a test file added there would not fail — it would simply
 * never run, which is the same silent green this whole branch exists to remove.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "api",
          environment: "node",
          include: ["src/api/**/*.test.ts"],
          testTimeout: 15_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: [...configDefaults.exclude, "src/api/**"],
          setupFiles: ["./test/setup-dom.ts"],
        },
      },
    ],
  },
});
