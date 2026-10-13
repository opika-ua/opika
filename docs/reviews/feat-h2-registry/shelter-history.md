# Review: shelter.history.list (RG-Q8): uncommitted tree vs 65cef94, Tier 1 synchronous

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
No evidence, moderator id or engagement data reaches the shelter. I read the mapper field by field. oRPC's z.object output also strips unknown keys. Domain fixtures run green. | Full `pnpm check` green (1543 passed, harness 217). The tree is uncommitted, so there is no commit body to read.
Actor mapping is correct for every event. A probe found: pause/resume by an admin shows as shelter, by a moderator as operator. A resubmit by a moderator shows as operator. start_review shows as operator, with no reviewerId. | Neon behaviour of `historyPage`. It is plain Drizzle select/where/orderBy and uses no raw execute.
Reason union: every Rejection, Suspension and Pause code comes back unchanged after projection and parse. No code is refused. | 
Cross-tenant: I removed the shelter filter from `historyPage` (vi.mock). The test "A's history read never returns B's entries" failed with `expected [ {…(5)} ] to deeply equal []`. This confirms the builder's mutation. | 
The read is side-effect-free: only a select runs (RS-Q1). | 
uk «Оператор реєстру» matches his RS-Q2 wording exactly. The fallback for unset and blank is tested. | 
The operator name is never stored: it reaches the projection only through the context. | 

FINDINGS (most severe first)
1. [medium] `packages/domain/src/shelters/history-shelter-facing.ts:126`: no test covers the pause/resume actor mapping.
   Failure scenario: I cut the condition down to `event.type === "resubmit"`. A shelter's own pause would then show as «Оператор реєстру».
   Evidence: with that mutant, the copied `history-shelter-facing.test.ts` passed (20/20). Fix: add tests for pause and resume by an admin, pause and resume by a moderator, and resubmit by a moderator.
2. [medium] `packages/contracts/src/kabinet/contract.test.ts:333`: the deep walk promised to Oleksii in approved shapes §2 is missing. That walk would fail on `moderatorId`, `evidence`, `reviewerId` or engagement fields at any depth. Only top-level keys are pinned.
   Failure scenario: a field added to `RejectionReasonSchema`, `ShelterLegalEntitySchema` or `DonationLinkSchema` reaches the shelter and nothing goes red.
3. [low] `packages/db/src/repos/kabinet-shelter-repo.ts:117`: no test reaches the tie-break branch (same `at`, `id DESC`). The handler test uses two different dates. Equal `at` is the normal case for a script batch (shelter_created + admin_invited + animals_imported written with one `now`).
4. [low] `packages/db/src/schema/shelter-history.ts:8`: "The operator reads it; the shelter never does." This became false with this diff.
5. [low] `history-shelter-facing.ts:53`: the union accepts a reason that doesn't match the event. A probe parsed `event:"approve"` with `{code:"spam"}` as `true`. This leaks nothing, but it is looser than the source union.
6. [low] `packages/contracts/src/errors.ts:171`: the comment says any `documentKey` "is refused", but no code refuses one yet. That writer is in a later row, so the comment claims the future in present tense.
7. [low] `KABINET_OPERATOR_DISPLAY_NAME` is missing from `.env.example`.
8. [nit] `packages/i18n/src/messages/uk.ts:817`: the comment cites "(RS-Q2)" twice.

`HistoryActorView` `{kind:"shelter"}` doesn't say which admin. That is fine: §2 approved exactly this.

SIMPLIFICATIONS
- `history-shelter-facing.ts:53`: replace the three-way `z.union` with per-event verification variants. This removes finding 5. If it is wrong, the renderer loses nothing, because `event` is still present.

TESTS
- domain `src/shelters/history*`: 3 files, 35 passed
- contracts `src/kabinet`: 1 file, 159 passed
- i18n: 4 files, 20 passed
- apps/web: operator, handlers, kabinet-cross-tenant, handlers-implement-contract: 4 files, 100 passed
- Probe and mutant files were deleted afterwards.
