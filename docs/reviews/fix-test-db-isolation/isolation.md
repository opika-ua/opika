# Review: 3231dd4 (fix/test-db-isolation), Tier 1, synchronous

VERDICT: PASS WITH NOTES (fix finding 1 before the real commit)

VERIFIED | TAKEN ON TRUST
--- | ---
Two paths give two names: mutated the hash input to a constant, and "gives two different checkout paths…" went red (`expected 'opika_test_96f6549c' not to be …`) | Full `pnpm check` green, 1523 workspace tests (the WIP commit body has no pasted output; the real commit must include it)
Pattern refusal: removed `!DISPOSABLE_NAME.test`, and 2 refusal cases went red (`expected '' to match /Refusing/`) | Harness: 217 passed, harness DB dropped on teardown
DROP without FORCE: create/drop test red, `database "opika_harness_…" is being accessed by other users` | CI behaviour (not run). From reading it: the service user `opika` is a superuser, so CREATE DATABASE works, and the runner path is stable
Fresh-checkout path: dropped this worktree's `opika_test_f65160f0`, then apps/web vitest recreated it, 652/652 | Teardown name matches the created name on Windows when cwd/drive-letter case differs (worst case is an orphaned DB, not a safety issue)
The override guard can be bypassed (finding 1): a probe ran live | —

FINDINGS
1. [high] packages/db/src/test-utils/test-database.ts:44. The guard checks only `pathname`, but postgres-js forwards unknown query params into the startup message, and they override `database`. `postgres://opika:opika@localhost:5433/opika_test_00000000?database=postgres` passes `assertDisposableTestDatabase`, and the connection reports `current_database() = postgres`. Swap in `?database=opika` and `setupTestDatabase` drops the dev DB's schema. That breaks the doc-comment's promise that "an override can't point the drop at something that matters". Fix: refuse any URL with `search` or `hash`, and add an `it.each` case for `…/opika_test_0123abcd?database=opika`. Then mutate (allow a query string) and confirm the case goes red.
2. [low] Stale comments that still name a shared `opika_test`: apps/web/vitest.config.ts:61, packages/db/test/city-slug-backfill.test.ts:37, wait-anchor-backfill.test.ts:47. In .github/workflows/ci.yml:29/33, `POSTGRES_DB: opika_test` is now only the health-check target. Add a one-line comment there, or point the health check at `postgres`.
3. [low] The vitest DB `opika_test_<hash>` is never dropped. A removed worktree leaves an orphan. That is acceptable (the request scoped drop-on-teardown to the harness), but it should be recorded.
4. [note] Port 3100: put it in a follow-up row, not this PR. It fails loudly (`reuseExistingServer: false`, "port already used") and corrupts nothing. The DB collision was silent, and that is what was asked for.
5. [note] `ensureTestDatabase` checks then creates (TOCTOU). Two concurrent first runs could hit 42P04. Not observed, because `pnpm -r` runs db before web. Optional: catch 42P04.

SIMPLIFICATIONS
- test-database.ts:45: `name === DEV_DATABASE_NAME ||` is redundant, because "opika" can never match `DISPOSABLE_NAME`. Removing it breaks nothing, and the "dev database" case stays red through the pattern. You can keep the constant for the message.

TESTS
packages/db test-database + prod-guard: 2 files, 32 passed. apps/web vitest from a dropped DB: 49 files, 652 passed. No harness run (per instruction).

---

## Re-review (pass 2, uncommitted delta on 3231dd4)

VERDICT: PASS

VERIFIED | TAKEN ON TRUST
--- | ---
F1: with the `search`/`hash` refusal replaced by `false`, both new cases went red (`refuses a derived name with ?database= overriding it`, `refuses a derived name with a fragment`). Restored: 11/11 pass | F3 recorded in the PR body, F4 follow-up row (both are future actions)
F2: read all four comment edits. Each is accurate and no longer calls `opika_test` shared | F5 42P04 branch: read, not exercised (a race is hard to provoke; the code is correct by reading)
Simplification: the redundant comparison is gone and the "dev database" case still refuses through the pattern (the suite passes) | —
`biome check` on the touched files: no errors | —

FINDINGS
None blocking. [note] biome warns `noConsole` on ensure-test-database.ts:11 (from the first commit). It is only a warning, so lint passes.

Reviewer incident: my mutation's cleanup ran `git checkout --` on test-database.ts and reverted the builder's uncommitted fix to HEAD. I re-applied it from the diff captured at the start of this pass (`git apply --check` was clean, and the stat matches: +18/-3). 34/34 pass afterwards. The builder should eyeball `git diff packages/db/src/test-utils/test-database.ts` before committing.

TESTS
packages/db test-database + prod-guard: 2 files, 34 passed.
