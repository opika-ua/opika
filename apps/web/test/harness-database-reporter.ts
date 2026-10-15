import { disposeTestDatabaseAfterRun, testDatabaseUrl } from "@opika/db/test";
import type { FullResult, Reporter } from "@playwright/test/reporter";

/**
 * Drops this checkout's harness database once the run is over (Oleksii,
 * 2026-10-13, relayed): it is recreated, migrated and seeded at the start of
 * every run. With `KEEP_TEST_DB_ON_FAILURE=1` a run that didn't pass keeps it, for
 * looking at what the failing test saw (`disposalAfterRun`).
 *
 * A reporter, not the `globalTeardown` that did this before: a teardown is
 * never told whether the run passed, and the keep-on-failure flag needs to
 * know. `onEnd` gets the run's status (an expected failure, `test.fail()`,
 * counts as passed, as it does for Playwright's exit code). The drop is not
 * forced: Playwright calls `onEnd` only after its teardown has stopped the
 * workers and the web server, so their connections are gone, and a session
 * still open is another run's (the database is then kept, and said so).
 *
 * The cost of a reporter: `--reporter` on the command line replaces the
 * configured list, and this one with it, so such a run leaves the database
 * for the next run to recreate. It never leaves anything a later run reads
 * stale: every run reseeds from scratch.
 */
export default class HarnessDatabaseReporter implements Reporter {
  async onEnd(result: FullResult): Promise<void> {
    await disposeTestDatabaseAfterRun(testDatabaseUrl("harness"), result.status);
  }

  printsToStdio(): boolean {
    return false;
  }
}
