# Review: merge of main (92e7542) into feat/h2-sign-in-wiring, a4454be + ffe690c

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Merge base bacf309. Every file only one side touched is byte-identical to that side in a4454be (scripted `git diff --quiet` per file, both directions: 0 differ) | Merger's green run (2568 unit, harness 226, orphan line clean): not pasted in a4454be's body (finding 4)
6 overlapping files read hunk by hunk: kabinet-confirm.harness.ts comment, h2-copy-sheet.md and uk.ts repoints (#96), test-utils/index.ts (#98 `disposeTestDatabaseAfterRun` + #99 `smokeTarget`), h2-next-prs.md (#96 fold note + #99's ticks), brand-voice.md (#99's text kept, no longer cites a deleted file, so #96 loses nothing) | CI on the pushed head
CLAUDE.md: #98's Commands block present (lines 447-452). #99 never touched CLAUDE.md (empty diff bacf309..886eedc), so there were no "#99 edits" to preserve | WI-B3's middle text (the brief elided it as "..."); its start and end match
playwright.config.ts = #98's version (reporter present); #99 never changed it | -
Playwright 1.62.1 source (`runTasks` → `taskRunner.run` awaits `cleanup()`, then `finishTaskRun` → `reporter.onEnd`): teardown (webServer stop, workers) finishes before onEnd. Both sign-in servers are killed and awaited in `afterAll`. The merge body's reasoning is correct | -
Local PG after my runs: neither `opika_harness_7748087f` nor `opika_test_7748087f` exists, so the drop works for this checkout | -
No stale references to the six deleted inbox files outside the shared table's fold notes and docs/reviews. No Literata contradictions | -
ffe690c quotes match the brief character for character (WI-T5 x2, WI-T10 x2). Test named in WI-T10 exists and asserts name-present, value-absent for 11 vars x 3 paddings, build and boot | -

FINDINGS (most severe first)
1. [medium] docs/decisions-inbox/feat-h2-sign-in-wiring.md WI-T5: ffe690c *replaced* the answer cell, so his relayed result ("db:neon-smoke: 21 passed, 0 failed … kabinet:neon-auth-smoke: 5 passed … Caveat: both ran on smoke-invite (ep-calm-math-b1ffs8rq…)") is no longer in any live doc. `git grep "21 passed, 0 failed"` finds only the expectation in h2-next-prs.md:373. The h2-next-prs tick cites WI-T5 as its evidence, and the inbox is append-only. Fix: put the result quote back next to his ruling.
2. [medium] Same file, WI-T10: the row has 7 cells, not 8 (8 pipes against 9 in every other row). The builder's Default-taken text (envValueOf, why it doesn't trim, the 11x3 test scope, the deploy note) was deleted. His answer now sits in "Default taken", the status sits in "Oleksii's answer", and Status is empty. Fix: restore the default cell (from 886eedc) and move the answer and status one column right.
3. [low, pre-merge, #99 fd86777] apps/web/test/harness/sign-in-server.ts:85-99: if the 60 s readiness poll throws, the spawned process is never killed. The caller's `server` is still undefined, so `afterAll`'s `server?.stop()` does nothing. Result: an orphan `next start` on a random port. harness-orphans.ts matches only the fixed harness port, so it can't see it, and the reporter keeps the DB as "in use". This is a regression from #94's inline version, which assigned `server` before polling. The orphan-check gap itself predates the merge (#94 already spawned the second server). Recommend for #99, before merge: kill the child in a catch around the poll (small, test-only). Widening harness-orphans to the sign-in server should be a follow-up row. Neither blocks switch-on, because neither touches production behaviour.
4. [low] a4454be's body has no pasted `pnpm check` output. Paste the merger's run, with scopes named, into the PR body.

SIMPLIFICATIONS
None in the merge delta.

TESTS
apps/web src/api/env.test.ts: 70 passed. packages/i18n copy-status.test.ts: 45 passed. packages/db test/test-database.test.ts: 13 passed. (Scoped per file. These are not the workspace total.)
Mutation: the merge adds no new guard. Not applicable.
