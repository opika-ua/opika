VERDICT: PASS WITH NOTES (PR #199, Tier 1 delta review, head 8f6f0ce959294715f16af5c54ff667f23423ffa4)

All eight findings from the c512421 STOP have landed. None of the notes below is a blocker: they are docs and tests notes, and none touches a security path production runs today. Findings 1 and 2 should be fixed before Oleksii runs the runbook against production for real.

| VERIFIED | TAKEN ON TRUST |
|---|---|
| #1: `full-reset.ts:146` is a plain `TRUNCATE`. All 22 FKs in `drizzle/*.sql` start from a listed table. The only FKs leaving the list point at `cities`. My probe: a table outside the list with an FK into `shelters` makes the plain TRUNCATE throw, and the outside row survives. With `CASCADE` put back: no error, and the outside row count goes to 0. | That TRUNCATE and `count(*)::int` → number behave the same on neon-http. Only postgres-js was run. The child-branch rehearsal is the first neon-http run. |
| #2: the coverage test queries `information_schema.tables`; there is no regex. Mutation: dropping `"swipes"` from the list → red, and the diff names `"swipes"`. | The builder's `animals_v2` mutation |
| #3: 15 steps in the order FR-F2 gives. `launch-gate.md` and `build-plan.md` cite steps 2/5/8/12/13/14/14.1–14.3 and "fifteen"; no ten-step or step 0/9 references remain. The boot-vs-test claim matches `instrumentation.ts:18-19`. | That Neon's "Restore from branch" keeps the endpoint id. The `r2:cleanup` invocation (that script isn't built yet). |
| #4: four tests spawn `src/full-reset.ts`, 4/4 green. One of them asserts "this target is PRODUCTION". | The builder's guard-removal mutation (I didn't re-run it, because it would reach a `*.neon.tech` host) |
| #5: all 17 tables are populated, and `before>0` is asserted for each one. Mutation: leaving `auth_verification` out of the TRUNCATE → "auth_verification should be 0 after a full reset: expected 1 to be +0". The same mutation passes c512421's old 4-table test (2/2). | |
| #6: a new file containing `"auth_user"` plus `TRUNCATE` → "expected [ 'full-reset.ts', 'zz-wipe-a.ts' ] to deeply equal [ 'full-reset.ts' ]" | |
| #7: the count is typed `number`, and a missing row throws. #8: the rehearsal section has PowerShell commands for the dry run, `--commit`, check-hashes and bootstrap. | |
| `--expect` is checked before the guard (`full-reset.ts:164-170`), the same order as `demo-remove.ts:655-666`. The only target output is `databaseTargetLine`. The override notes sit next to both tables in `auth.ts`. CI run 40217436388 at this SHA is green. | Oleksii's five quotations (FR-F1..F5); I have not seen his messages. FR-F2's quotation in the inbox continues past the point where the commit message's quotation ends. |

FINDINGS (most severe first)
1. [Medium] `docs/launch-sequence.md:187-190`: the R2 job is required only from step 6, which comes after the first irreversible reset. FR-F4 says, verbatim: "built, deployed and enabled before the first real reset". If the job isn't ready, steps 1–5 run and step 6 can't. Fix: state the requirement before step 1. Also, "cycle 2's step 2" should say step 8.
2. [Medium] `docs/launch-sequence.md:93,122,136`: step 2 ends with `Remove-Item Env:DATABASE_URL`. Steps 3 and 4, and steps 9 and 10 ("identical"), then exit with "ERROR: DATABASE_URL is not set." (`check-migration-hashes.ts`, `admin.ts:167-170`). The scripts refuse rather than run, but the runbook can't be run as written. Two more problems in the same runbook: `Read-Secret` is never defined (`onboarding-a-shelter.md:13` defines it), and admin.ts ignores `--expect` on line 49 without saying so.
3. [Medium, tests] `full-reset.ts:146`: nothing guards the fix for finding 1. With `CASCADE` put back, all 9 tests stay green. The PR body's "Every one of the six fixes was mutation-tested" is untrue here: 1b8e179 records no mutation for this fix. Commit my probe as a test.
4. [Low] RG-T9's exception isn't written where RG-T9 is. The note at `auth.ts:167` sits on HS-T2's never-delete rule. `super-admin-repo.ts:26-30` still says "bootstrap never runs twice", which is false after a reset, and steps 4 and 10 rely on it running again. Line 141, "this is the one time it can run", contradicts step 10.
5. [Low] `decisions-inbox/feat-full-reset-wipe-and-flip.md:11-14`: rows FR-F2..F5 have 7 cells under 8 headers, so his verbatim answers land in the "Default taken" column.
6. [Low] `docs/onboarding-a-shelter.md:395`, "Retiring the rehearsal shelter" (via `demo:remove`), still reads as current, and step 5 points the reader into that doc. It needs a pointer saying it's superseded (this is outside the diff).
7. [Low] `auth-user-deletion-scan.test.ts:126-135`: a file that imports `FULL_RESET_TABLES` and truncates passes the scan (my probe stayed green). `test-utils/setup.ts` already has that shape.
8. [Low] 8f6f0ce's commit body has no pasted `pnpm check` output. CI at this exact SHA is green.
9. [For Oleksii, not a blocker] Nothing stops `db:full-reset` running after launch. The rule in `full-reset.ts:41-43` that every real run happens before any real shelter exists is not enforced. One option: a final runbook step that deletes the script after step 12.

SIMPLIFICATIONS
- `full-reset-table-coverage.test.ts:54-59,68-74`: drop the overlap check, the "at least one table" test and the "no __drizzle_migrations" test. `covered.toEqual(actual)` already fails on a duplicate, an empty result or an extra table, so the "Not a tautology" comment is wrong. If I'm wrong, a duplicate name would go uncaught.
- `full-reset.ts` `formatCounts`: un-export it, since nothing imports it.

TESTS
Local, at 8f6f0ce:
- full-reset, coverage and auth-user scan: 3 files, 9 passed.
- prod-guard `-t full-reset`: 4 passed, 287 skipped.

CI run 40217436388:

| Package | Result |
|---|---|
| domain | 608 |
| i18n | 705 |
| contracts | 403 |
| ui | 10 |
| db | 1021 passed + 1 skipped (Windows-only `runIf`) of 1022 |
| web | 3085 (177 files) |
| harness | 158 passed |
| Workspace unit tests | 5832 passed + 1 skipped |
