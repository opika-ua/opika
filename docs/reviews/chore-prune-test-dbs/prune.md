# Review: chore/prune-test-dbs (uncommitted, off bacf309), Tier 1, pass 1

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| `vitest run test/prune-test-dbs.test.ts`: 34/34 green | Builder's full `pnpm check` (2462 vitest, harness 222/3 skipped) |
| Real `pnpm db:prune-test-dbs` dry run on the live server: 18 DBs listed, all "unknown origin", "Nothing to drop"; DB count 19 before and after my runs | Both teardowns dropped 82b97c4b after the green run; the manual keep-flag runs |
| Probe with the real fs and `realpathSync.native`: recorded path as 8.3 short name, junction, upper case, forward slashes, trailing slash all give `current_checkout`. Unreachable UNC and unmapped `Z:` give `unverifiable/root_missing` (UNC took 2.7 s). Deleted dir gives `gone` | That a permission-denied path reads as `unknown`. My icacls probe was blocked. A child of System Volume Information reads `missing`, which is correct because it really is absent |
| postgres.js against a dead localhost port throws AggregateError with `code: "ECONNREFUSED"`, so the "server down" branch matches | pnpm `-r` runs packages/db's vitest before apps/web's (topological order) |
| vitest 4.1.10 source: every project's globalSetup teardown runs in `Vitest.close()` after all projects finish, one after another. No drop inside a run between apps/web's two projects | Playwright `onEnd` gets `interrupted` on Ctrl-C |
| Mutations I ran myself (both match the commit's text): mayDrop current-name check removed → "expected true to be false"; `status_unknown` line removed → `expected { kind: 'gone' } to deeply equal { kind: 'unverifiable' }` at test:160 | The other 19 mutation lines. They are present and each names a concrete break |
| Hosts: localhost, 127.0.0.1, 0.0.0.0, ::1 count as local. host.docker.internal and Neon are refused. `?host=` is refused. `DATABASE_URL` is never read | |

FINDINGS (most severe first)

1. [medium] `packages/db/src/test-utils/vitest-global-setup.ts`: any vitest invocation in packages/db or apps/web now ends with `DROP ... WITH (FORCE)` on this checkout's `opika_test_<hash>`. That includes one pure-unit file that never opened the DB.
   Failure scenario: an async Tier 2 reviewer runs `vitest run src/foo.test.ts` in the shared tree while the builder's `pnpm check` is in apps/web's api project. The reviewer's teardown drops the builder's DB mid-run and its connections are terminated.
   Already true before this diff: two DB-backed runs clobbered each other (setupTestDatabase drops tables), and the harness was already dropped. What is new: a pure-unit run now interferes. Effect is test failures only, no data loss.
   Fix options: drop without FORCE and treat 55006 as "kept: in use" (check first that own workers' connections are closed, since teardown runs before `pool.close`). Or record it in CLAUDE.md as a known limit.
2. [low] vitest Ctrl-C: `onExit` calls `process.exit()` without `close()` (cli-api, line about 2053), so the teardown never runs and the DB stays whatever the flag says. Safe direction. Similarly, a harness run with `--reporter` keeps its DB (PT-T4; acceptable, the next run or the prune covers it). The CLAUDE.md line "dropped when its vitest/harness run ends" overstates this: add "(not after a Ctrl-C'd vitest run or a `--reporter` harness run)".
3. [low, paperwork] PT-1 is honestly labelled as paraphrase. But the session memory `prune-test-dbs-plan.md` says "Record his words verbatim in that branch's inbox when it starts", and that was not done. The coordinating session should paste them. Also, `harness-database-reporter.ts` says "(Oleksii, 2026-10-13)" while the two siblings say "relayed". Make them consistent.

Same-checkout race (asked): yes, see 1. Separate checkouts get separate DBs. The prune only acts on `gone` paths, so it cannot touch a live run.

SIMPLIFICATIONS
- `packages/db/src/test-utils/index.ts`: remove the `disposalAfterRun`, `KEEP_ON_FAILURE_ENV` and `RunOutcome` re-exports. Nothing outside the package uses them, and the tests import from `src`.

TESTS
packages/db test/prune-test-dbs.test.ts: 34 passed (34). Full workspace not re-run (builder: 2462 vitest; harness 222 passed, 3 skipped).
