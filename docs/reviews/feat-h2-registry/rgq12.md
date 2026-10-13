# Review: RG-Q12, c15ed75 (WIP on 641e1f0), Tier 1, synchronous

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Approve and reject both go through `editFromForm`. The version precheck runs before planning, and `writePlanned` passes `shelter.version` (which equals `expectedVersion` once the precheck passes) to the `applyAuditedMany` CAS, which is `WHERE version = $read`. A conflict there throws CONFLICT, with no retry (read). | The CAS-race CONFLICT, where the precheck passes but a concurrent write lands before the statement. This diff has no test for it; it relies on the existing repo tests.
"Nothing pending": a stale version is CONFLICT, because the precheck comes first. At the current version the plan writes nothing and returns the current view. Covered by the existing test (read + ran). | Your full `pnpm check` (1731 workspace, harness 217). It is not pasted in the WIP commit body, so the real commit must paste it.
Every writer of `pending_donation`: propose, cancel, approve and reject all go through `applyAudited`/`applyAuditedMany` (`version + 1`). Other writers: `shelterRepo.update` (full row, does not bump `version`) has no production caller. Onboard, seed and create are inserts (grep). | The quotes for RG-T8, RG-T10 and RG-R3. Only the RG-Q12 quote was in my prompt; it matches character for character.
Mutation: approve switched to `tapWithRetry` gives `registry.test.ts:624 expected 200 to be 409` (red). |
Mutation: a same-link re-proposal returns `no_change` gives `handlers.test.ts:223 expected 1 to be 2` (red). |
Mutation: reject switched to `tapWithRetry` leaves 84/84 green (see finding 1). |

FINDINGS
1. [medium] `apps/web/src/kabinet/registry.test.ts:603-638`: no test exercises reject's version check. The stale-read test only sends a stale *approve*; its reject uses the fresh version.
   Failure scenario: reject is reverted to the unversioned tap. A stale reject then silently throws away a link the operator never saw, and the suite stays green.
   Evidence: I swapped `registryDonationReject` to `tapWithRetry`. The three touched suites all stayed green (84 passed). Fix: add a stale reject (expect 409, nothing decided). An `it.each` over approve and reject would cover both.
2. [low] `apps/web/src/kabinet/handlers/registry-writes.ts:85-88`: the doc comment on `tapWithRetry` still lists "a donation decision" as a tap with no version in its input. That is now false. The comment states a reason, so it is a claim, and it needs editing.
3. [low] `packages/contracts/src/kabinet/contract.test.ts`: no contract test pins the new `expectedVersion` input or the CONFLICT error on `registry.donation.*`. Coverage today is indirect. Dropping the field breaks the handler tests through strictObject 400s. Dropping CONFLICT breaks typecheck through `E<"CONFLICT">`. I did not run that typecheck mutation. Optional: pin `errorMap.CONFLICT?.status === 409` for both paths, as the FORBIDDEN block already does for its codes.

Scope: the docs changes (RG-T8, RG-T10, RG-R3 answers, the rehearsal-0011 result) are bookkeeping bundled with RG-Q12. They are acceptable in a WIP that will be split. No STOP items: no user copy, no migration (0011 untouched), no secrets.

SIMPLIFICATIONS
- `registry-writes.ts` `registryDonationApprove`/`Reject`: two bodies that differ only in the literal `"approved"`/`"rejected"`. One `registryDonationDecide(decision)` factory would do. If this is wrong, nothing breaks; the router just binds twice.
- `packages/db/src/repos/shelter-repo.ts:34` `update()`: writes the whole row, `pending_donation` included, without bumping `version`, and has no production caller. Removing it removes the one writer that could defeat RG-Q12's CAS. If this is wrong, any test that uses it fails to compile (outside this diff; schedule it).

TESTS
apps/web (registry.test, handlers.test, kabinet-registry-access.test): 3 files, 84 passed (84). packages/contracts: 4 files, 190 passed (190). Scope: these files only. No harness.
