# Review: feat/h2-kabinet-contracts, S3 working tree (uncommitted, against f48bb59). Tier 1, synchronous

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| domain `src/animals` + `src/shelters`: 13 files, 273 passed | Full `pnpm check` green (builder's run: 1266 unit tests, harness 217) |
| contracts: 4 files, 116 passed | Builder mutations. Could not re-run one: scratch copy denied, in-tree edits forbidden. Read "release keeps undoable": confirmedAt stays T1, so the undo would land and the test would go red. Holds on reading |
| db `undo-backfill` + `shelter-state-backfill`: 9 passed, local Postgres | 0008 on Neon (not run anywhere yet; child-branch rehearsal is planned) |
| Public views never pick `listing` wholesale (`views/animal.ts` uses `listingKind` only), so `undoable` doesn't reach adopters | `0008_snapshot.json` matches the schema |
| `shelterFacingVerificationOf` drops evidence and every moderator id (test checks the JSON for MOD and the reference name) | |
| `pendingDonation.proposedBy` is the shelter's *own* admin id, not a moderator id. Shown only to that tenant and the operator. No cross-tenant leak | |
| No brand strings in contracts/domain (only `@opika/` import scope) | |
| Copy-sheet E2 adds no Ukrainian (English sense only, `[COPY PENDING]`) | |

## Findings (most severe first)

1. **[medium] `kabinet/contract.test.ts:152-247`: commitment #2 is pinned on view schemas, not on the shelter router's outputs.** The H2 done-criterion says "a test over the shelter-facing router's own output schemas". Wrapper outputs are unpinned: `shelter.animals.list` → `{items, nextCursor, counts, staleCount}`, and `confirm` → `{animal, undoUntil}`. Failure scenario: someone adds `revealCount: z.int()` beside `staleCount` in `procedures.ts`, and every test stays green. Fix: walk each `kabinetContract.shelter.*` procedure's `outputSchema` and pin its top-level keys, or deny engagement-shaped keys recursively.

2. **[medium] `listing-transition.ts:650`: the `undoable.confirmedAt === confirmedAt` clause isn't exercised by any test.** Through the FSM, every non-confirm event clears `undoable`, so no test builds a state where the two differ. Deleting the clause would turn no test red (traced through every case in the "undoing a confirmation" block and the 40-pair table). The comment at `listing.ts` ("so a later write can be told apart") claims a guard that nothing tests. Fix: add a test with `undoable.confirmedAt ≠ confirmedAt` → `undo_expired` (the case is a raw repo write, as `repos.test.ts:652` does). Or delete the clause and the field's stated purpose.

3. **[medium] Inbox S3-T1 and S3-T4 change an approved Tier 1 spec but are filed as "Tier 2, default taken."** T1 drops `document_not_issued` from the approved `INVALID_EVIDENCE` reasons. T4 replaces the approved `{from, event}` with a `machine` union. Both look like good calls and neither is a STOP item. But they amend a contract Oleksii approved, so per CLAUDE.md they're Tier 1 decisions that block the **merge** (not the commit). Relabel them. T2, T3 and T5 fill gaps the spec left open; T5 (the server stamps `at`) strengthens commitment #7.

4. **[low] Three doc comments are now orphaned by insertions.** In `errors.ts:11-37` the O-20 `apiErrors` comment now sits on `IllegalTransitionDataSchema`. In `listing.ts` the `AnimalListingStateSchema` rationale now sits above `UndoableConfirmationSchema`'s doc. In `listing-transition.ts:~95-112` the transition-table decisions doc now attaches to `type Confirmable`. Move each new declaration above or below the comment it split.

5. **[low] `shelter.ts` `version` comment vs `update.expectedLastUpdatedAt`.** The comment says a timestamp guard "breaks" on precision. The approved spec still CASes animals on a timestamp. It holds today because `last_updated_at` is only ever written from JS (no `now()` in any migration). Record it as a handlers-slice follow-up, not a blocker.

6. **[low] 0008's comment says "(or a re-run) is left as it is".** That's true of the UPDATE only. The file as a whole isn't re-runnable (`ADD COLUMN` without `IF NOT EXISTS`); the drizzle journal is what prevents a re-run. Also, the jsonb `?` operator is new to this repo's migrations, so the Neon child-branch rehearsal should be what proves it.

## Simplifications

- `evidence.test.ts`: drop "is pinned literally". The exhaustiveness test above it already catches drift. If wrong: a reorder goes unnoticed, which doesn't matter.
- `policy.ts`: derive `EvidenceGap` from `EvidenceGapSchema` (`z.infer`) instead of keeping the hand-written type next to it. If wrong: nothing; the shapes are identical today.

## Tests

domain 273/273 (scoped), contracts 116/116, db 9/9 (scoped). Full suite taken from the builder's run.
