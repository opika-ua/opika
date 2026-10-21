Verdict for b5fbfa4216d1d673505e021d6468421c3f679c48: PASS WITH NOTES

Review of PR #166 (`fix/raw-execute-neon-http`), pinned to `b5fbfa4216d1d673505e021d6468421c3f679c48`. The
branch head was still that SHA when the review ran; base was origin/main `5946366`. This was a single review
in a fresh cloud session. Not Tier 1. **Migration: none.** I did not run anything against Neon. Oleksii's
real-Neon smoke (step 38) is still required before merge.

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| drizzle-orm **0.45.2** `neon-http/session.js`: raw `execute` (no fields) uses `rawQueryConfig = { arrayMode: false, fullResults: true }` and returns the client's full result (`{ rows, fields, … }`). Typed selects use `{ arrayMode: true, fullResults: true }`, then `mapResultRow`, which applies `.mapWith(Number)`. So the old `Array.from(result)` gives `[]` on Neon, and the typed select is shape-independent. | The typed select's **actual neon-http** run (array-mode rows mapped by `mapResultRow`). Locally only the postgres-js typed path runs. Step 38 on a real Neon branch is the proof, and that is Oleksii's. |
| (1) The typed select keeps the same semantics: the base is `buildDiscoverabilityPredicate`, `current` uses the same `currentFilter`, and each `without_<i>` uses `relaxDimension` + `buildFilterPredicate` over `FEED_FILTER_DIMENSIONS` (which includes `coatLengths`, S2). It is still one `SELECT … FROM animals WHERE base` with numbers through `.mapWith(Number)`. The return shape `{ current, relaxations }` is unchanged, so the suggestions code consumes it as before. | The neon-http count type (string or number) before `mapWith`. Both are handled. |
| (2) The Proxy in `gallery-repo.test.ts` replaces only `execute` with `{ rows, fields }`, which matches 0.45.2's raw shape. The typed select doesn't route through `db.execute`, so the new code is unaffected. The old code goes red (M1). | The builder's step-38-over-a-neon-shaped-db mutation. |
| (3) My own grep of `.execute(` / `.unsafe(` / `sql.raw` / `$client` / `.query(` across apps/ and packages/ matches RX-D2 on every path that can reach Neon. The only other raw SQL that can reach Neon is `kabinet-animal-repo.ts:174` `sql.raw` inside a builder `.insert().select().returning()`, which is typed and safe. | — |
| (4)(5) Scan test and `rowsOfRawResult`: mutations below. `rowsOfRawResult` throws on `{ fields }` and `null`, and a `[]` fallback would fail its test. The scan's non-empty-tree guard (`toContain` gallery-repo / neon-smoke) is unconditional. | — |
| (6) Step 38 creates its own city, a verified shelter and 1 cat + 2 dogs, filtered by its own city id. It asserts `current 1` and `species +2`, both 0 under the bug, and prints counts only (host only, as before). Rows stay on the disposable branch, like every other step. `neon-smoke.test.ts` expects 38, and the local run passes. | — |

FINDINGS (most severe first)

1. **[major, non-blocking] `packages/db/test/raw-execute-reads.test.ts:58` lets through the original bug shape once Biome wraps it, and the PR understates its gaps.** The scan exempts any line that *starts* with `await x.execute(`. That is also how Biome formats a long argument.
   Failure scenario: `const rows = Array.from(\n  await db.execute<…>(\n    sql\`…\`,\n  ),\n);` in a repo file reads the raw result as an array, which is exactly #112, and the scan stays green.
   Evidence: in a scratch copy I added that function to `city-repo.ts` and ran `biome format`. The output kept `await db.execute<…>(` at the start of its own line, and the scan reported `5 passed`. A same-line `await db.execute(q).then((x) => …)` also passes. That one is not "a `.then` on a later line", which is the residual the PR names. The client.ts comment ("now refuses any raw `.execute()` whose result is used") overclaims for the same reason.
   Fix: exempt only a statement-start `await …execute(` whose previous non-blank code line ends in `;`, `{` or `}` (or is blank), and refuse `).then(` on an execute line. Add the wrapped shape as a case to `rawExecuteReadsIn`'s test. Otherwise, record these residuals in RX-D3 and the PR body.
2. **[minor] `packages/db/test/neon-smoke.ts:1788`.** Step 37 still says "Last on purpose: it signs out every session the steps above wrote", but it is no longer last. Step 38's own comment explains why that is harmless. Reword 37's comment to "after every step that writes a session".
3. **[minor] RX-D2 / PR body sweep table.** It lists `.unsafe(` only for some test files. `shelter-state-backfill`, `first-published-backfill`, `confirmation-backfill` and `city-slug-backfill` (`*.test.ts`) and `prune-test-dbs.test.ts:433` aren't named. All are raw postgres-js and local only, so the verdict doesn't change, but the table claims "every".

SIMPLIFICATIONS
- None. `executeRows` has one caller (`check-migration-hashes.ts`), but it is the designated reader the guard's message points to, so it stays.

TESTS (my runs, Node 24.22.0, local Docker `postgis/postgis:17-3.5`)
- `packages/db`: 51 files, **906 passed, 1 skipped** (907)
- `apps/web` unit: 151 files, **2732 passed**. The builder's 2729 was on the pre-rebase base; main added tests.
- `pnpm typecheck`: clean. `pnpm lint`: 156 warnings, 1 info, 0 errors, none in changed files. `pnpm build:web`: compiled.
- `test:harness` (Chromium headless shell 1234 downloaded to `/opt/pw-browsers`, nothing committed): **251 passed**, exit 0.
- Mutations, all in a discarded worktree:
  - M1, old `relaxationCounts` restored: `gallery-repo.test` "counts the same over a driver whose raw results are `{ rows }`" failed with "expected { current: +0, …(1) } to deeply equal { current: 1, …(1) }". The scan failed with `packages/db/src/repos/gallery-repo.ts:201`. Both match the builder's commit-body text, so the cross-check passes.
  - M2, the `coatLengths` relaxation built from `currentFilter` (fur's FILTER dropped): `coat-length.test` "the fur relaxation is the unfiltered count minus the filtered one, unrecorded included" went red.
  - M3, `const r = await db.execute(sql\`select 1\`); return r[0];` added to `city-repo.ts`: the scan went red at `city-repo.ts:32`. A later-line `.execute(` (`await db\n .execute(…)`) was also caught. The aliased `run(…)`, the same-line `.then` and the Biome-wrapped argument were **not** caught (finding 1).
- Not run: anything against Neon (no access, by guardrail), including step 38 on neon-http.
