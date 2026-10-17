# Review: feat-demo-remove, DR-Q1 delta (uncommitted, on d0edccc), Tier 1 pass 3

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
No delete of `support_sessions` anywhere: grep finds no `delete(supportSessions` in packages/apps; the table is gone from `DEMO_REMOVAL_TABLES`, `TARGETS` and the commit sequence | The pasted `pnpm check` totals (unit 2586, harness 226): no commit body exists yet. Paste them in the commit
No cascade: migration 0011 has both FKs (`shelter_id`, `operator_user_id`) `ON DELETE no action`. `demoOnlyUserIds` (line 148) already leaves out any user who operated a session, so the user delete can't reach one either | That production has a `rehearsal-` test shelter on the real key (build-plan bullet 2)
The refusal fires in both places: the dry run (`main` → `planDemoRemoval`) and the commit's in-transaction re-plan (`removeDemoCorpus` → `planDemoRemoval(tx)` → `refused`) call the same function. The new test drives the commit path | Production's demo support-session count
Mutation, run by me: I commented out the refusal push (lines 237-239). The new test went red at `test/demo-remove.test.ts:475`, `Failed query: delete from "shelters" …`, `Caused by: PostgresError: … violates foreign key constraint "support_sessions_shelter_id_shelters_id_fk"`. Restored, 15/15 green |
The message is honest. It states the count, says the rows are never deleted (RS-Q0), says the shelters can't go and that the decision is Oleksii's. That matches his quote |
The DR-Q1 quote in `demo-remove.ts` is character-identical to the inbox answer column |

## FINDINGS (most severe first)

1. **[medium] `docs/build-plan.md:1029-1036`: the checklist decides a conflict between two of his instructions without saying so.**
   - **The two instructions.** DR-B2 says "before the first real shelter". DR-B1 step 5 says (a) onboard the real shelter, (c) run demo:remove, (e) "/tvaryny shows only the real shelter's animals".
   - **What the checklist does.** Its heading rewords his "before" to "at". The first bullet places the demo removal after onboarding, citing DR-B1. That bullet also sits under a section titled "Before the first real shelter … is inserted", so it contradicts its own section.
   - **The tool doesn't force this order.** His own test shelters satisfy guard 3a, so the demo corpus could go before any real shelter exists. Only DR-F2's removal of his own test shelters would then empty the site.
   - **A second premise has also changed.** DR-B1 step 5 begins "after the rehearsal passes", and DR-B2 drops the rehearsal.
   - **Fix:**
     - Keep his word "before" in the heading.
     - State that DR-B1 (after onboarding) and DR-B2 (before) differ on when the demo corpus goes.
     - Add an inbox question (DR-Q2) for him to choose the order.
     - Until he answers, the bullet should record both orders and choose neither.
   - This doesn't block the commit (no run happens in this diff). It does block the production run.

2. **[low] `demo-remove.ts:113`, the `demoSupportSessions` plan field: nothing reads, prints or asserts it.**
   - **Problem.** His answer is "if the count on production isn't 0 … I decide again with the number in front of me". The count only appears inside the refusal line when it is non-zero, and the zero case prints nothing. Inbox option (b) promised "production's count (shown by the dry run)".
   - **Fix.** Print it in `formatPlan`, e.g. `Support sessions on demo shelters: N (never deleted)`, and assert it in the plan test. Otherwise delete the field (see Simplifications).

3. **[low] `demo-remove.ts:7-12`, header: the comment attributes its scope list to DR-B1, but that list now differs from DR-B1's.**
   - DR-B1 answered "exactly as listed", and that list included support sessions.
   - **Fix.** Add "narrowed by DR-Q1 (b)" so the attribution stays true.

## SIMPLIFICATIONS

- **`demo-remove.ts:113,253`:** drop `demoSupportSessions` from `DemoRemovalPlan`, unless finding 2 prints it. The refusal already carries the number. Nothing breaks: no reader exists.

## TESTS

`pnpm --filter @opika/db exec vitest run test/demo-remove.test.ts` gave 1 file, 15 passed (15). With the mutation: 1 failed ("when a demo shelter has a support session"). After restoring: 15 passed.
