import type { TestProject } from "vitest/node";
import { disposeTestDatabaseAfterRun, type RunOutcome } from "./test-database";

/**
 * Vitest `globalSetup` for every suite that uses this checkout's test
 * database (`packages/db`, both `apps/web` projects): nothing to set up
 * (`setupTestDatabase` creates it on first use), and a teardown that drops it
 * once the run is over (`disposeTestDatabaseAfterRun`).
 *
 * A teardown rather than a reporter: a `--reporter` on the command line
 * replaces the configured reporters, and the drop would silently go with
 * them. The teardown runs however the run is reported, once, when vitest
 * closes (in watch mode, on exit rather than after every re-run).
 *
 * The URL is read lazily, not imported from `./setup`: that module validates
 * `TEST_DATABASE_URL` at import, and this file is loaded by every suite's
 * config, including the ones that never touch a database.
 */
export default function testDatabaseGlobalSetup(project: TestProject) {
  return async () => {
    const { TEST_DATABASE_URL } = await import("./setup");
    await disposeTestDatabaseAfterRun(TEST_DATABASE_URL, runOutcome(project));
  };
}

/**
 * "passed" only when every test module ran and passed (or was skipped) and
 * nothing errored outside a test; a module still queued or pending means the
 * run was cut short. One project's teardown sees every project's modules
 * (`vitest.state` is the whole run), so two projects can't disagree.
 */
export function runOutcome(project: Pick<TestProject, "vitest">): RunOutcome {
  const { state } = project.vitest;
  if (state.getUnhandledErrors().length > 0) return "failed";
  const modules = state.getTestModules();
  if (modules.some((m) => m.state() === "failed")) return "failed";
  if (modules.some((m) => m.state() === "pending" || m.state() === "queued")) return "interrupted";
  return "passed";
}
