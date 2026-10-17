# Review: feat-demo-remove, delta for drq1.md findings 1-3 (uncommitted, on d0edccc), Tier 1 pass 4

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
F1: build-plan Part 5 heading keeps "before". The quote "remove all test shelters (demo + mine) before the first real shelter" is a character-exact substring of DR-B2's answer column | The pasted `pnpm check` output: no commit body yet. Paste it in the commit
F1: the bullet records both orders and picks neither. Its paraphrase of DR-B1 step 5 ((a) onboard, (c) demo:remove, (f) invite) matches DR-B1's answer column |
DR-Q2 row: the only text in quotation marks is "before the first real shelter", which is his (DR-B2). The answer column is empty, status is open, and "Default taken" is "none: his call" |
F2: `formatPlan` prints `Support sessions on demo shelters: 0 (never deleted; any is a refusal)` at 0, and the plan test asserts that line. Mutation, run by me: I printed the line only when the count is > 0. The test went red at `test/demo-remove.test.ts:309:21`, "expected 'Demo shelters (2):…' to contain 'Support sessions on demo shelters: 0 …'". Restored, 15/15 green |
F3: the header now reads "narrowed by his DR-Q1 (b) to leave support sessions alone", and its scope list no longer names support sessions or memberships. Accurate |

## FINDINGS

1. **[low] `docs/decisions-inbox/feat-demo-remove.md`, DR-Q2 options: the question leaves out one consequence.**
   - **The gap.** DR-B2 also removes *his own* test shelters "before the first real shelter". DR-B1 guard 3a says "the site must never end up empty". Taken together, under either order of the demo removal, the site is empty once his last test shelter goes (DR-F2) if no real shelter is in yet.
   - **Why it matters.** The real choice is about when *all* test shelters go relative to onboarding, not only the demo corpus. The option "before onboarding (the site holds only his test shelters for a while)" reads as if nothing else follows.
   - **A second omission.** DR-B1's step 5 is premised on "after the rehearsal passes", and DR-B2 drops the rehearsal. The row doesn't mention this.
   - **Fix.** One clause in the row naming both points, so his answer covers DR-F2's timing too. This doesn't block the commit or the merge. It does block the production run, which DR-Q2 already does.

No other findings.

## TESTS

`pnpm --filter @opika/db exec vitest run test/demo-remove.test.ts` gave 1 file, 15 passed (15). With the mutation: 1 failed | 14 passed. After restoring: 15 passed.
