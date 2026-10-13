# Review: review/scripts (345deda..a19d9a4): admin scripts, script history, 0011 pin, Neon smoke

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Touched suites green: db admin, neon-smoke, check-migration-hashes, prod-guard (4 files, 57 tests); web script-history + no-self-serve-yet (2 files, 8 tests) | Builder's full `pnpm check` (1723 workspace, harness 217). WIP commits carry no pasted output or `mutation:` lines; the final commit must have both |
| Mutation: smokeTarget prod check removed → red, "refuses production, even when expected … expected 'ok' to be 'refused'" | The 0011 pin going red on an edit (it's a literal hash, so not self-comparing) |
| Mutation: bootstrap `NOT EXISTS` removed → red, "refuses in the write itself … expected { kind: 'bootstrapped' } to deeply equal { kind: 'refused' }" | drizzle-kit migrate's output on Neon (prints no URL?) |
| Probes (scratch, deleted): concurrent bootstrap, grant to an invitee, smokeTarget with a malformed PROD value. Results below | onboard `main()` wiring (no test runs it) |
| Wrapper and every `admin:*` print only `hostname`. Refusal strings carry no URL | neon-http error text not echoing credentials |
| Provenance: RG-Q2, RS-Q1 and RG-Q8 are recorded verbatim in the inbox. sweep `--apply` deleting is Oleksii's own instruction, so not a STOP | |

FINDINGS (most severe first)
1. [high] test/neon-smoke.ts `smokeTarget`: unlike `checkProductionWrite`, this doesn't check that `PROD_NEON_ENDPOINT` is shaped like an endpoint id. A malformed value counts as "known and different".
   Failure scenario: PROD set to a URL or a quoted `"ep-prod-1"`, plus `--expect ep-prod-1` on the prod URL → `{kind:"ok"}`. The smoke then writes a membership, sessions and an operator on production. RG-T8 holds only if this guard holds.
   Evidence: probe returned `{"kind":"ok","host":"ep-prod-1-pooler…"}` for both values. Fix: refuse unless the value matches `^ep-[a-z0-9-]+$`, or reuse prod-guard's check. Add both cases to the refusal table.
2. [medium] super-admin-repo.ts `bootstrap`: `NOT EXISTS` doesn't serialize concurrent runs. The partial unique index is per user, not global. admin.test.ts says "a race between two runs creates one operator", and that is false.
   Evidence: two connections running `Promise.all` bootstraps → 2 operators in 20 of 20 runs. RG-Q2 says "one-time only". Fix: `pg_advisory_xact_lock` or a global singleton constraint. At minimum, correct the comment.
3. [medium] super-admin-repo.ts `grant`: it checks memberships only. A user with a pending invitation can be granted, and accepting later gives `conflicting_roles` (locked out).
   Evidence: invite → `admin:grant` exit 0 → membership → `roleOf` = `{"kind":"conflicting_roles"}`. Fix: also refuse a live pending invitation for the address. Related, outside this diff: `kabinet-invitation-repo.invite` doesn't refuse an operator's address.
4. [medium] seed.ts and onboard-shelter.ts: the RG-Q8 wiring isn't asserted anywhere. Reverting either to `shelterRepo.insert` leaves everything green, because the harness runs seed but checks no history. Add one assertion of seed history, or factor onboard's insert and record into a tested function.
5. [low] neon-smoke.ts step 10: it passes `organizationId: string | null`, and `null` means every shelter. On a prod-child branch that would sweep real invited users. Return FAIL when it's null.
6. [low] rehearse-0011.mjs: `--expect` is checked only with `startsWith("ep-")`, then passed through `shell:true`. Validate it with `^ep-[a-z0-9-]+$`. There's no other path to production: migrate's guard and smokeTarget both apply.
7. [low] admin.ts sweep dry run: `cleanupCandidates` doesn't exclude operators or support-session users, but `deleteCandidates` skips them. The dry run can list someone `--apply` won't delete.

RG-T8: the move is honest. The guard's invariant is "no membership outside tests". This is a test fixture that refuses any target except a named non-production endpoint, and the decision is in the inbox, not done silently. That honesty depends on finding 1.

SIMPLIFICATIONS
- super-admin-repo.ts: `const repo = {…}; return repo;` → return the object directly. Nothing breaks.
- script-history.ts `ScriptActor.newId`: every caller passes `randomUUID`. Fixed ids aren't needed because no test asserts them. Removing it breaks nothing.

TESTS
db: 4 files, 57 passed. web: 2 files, 8 passed. Mutations: 2 of 2 red. Harness not run, per instruction.

---

## Re-review: 5bc1e62 (delta only)

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Touched suites green: admin, neon-smoke, script-writers, invitation-repo (4 files, 41 tests) | F1 mutation (id check removed → both new refusal cases red). I read the new refusal cases but didn't mutate them |
| Mutation F2: fixed grant id → `randomUUID()` turns "lets exactly one of two concurrent bootstraps through" red (`bootstrapped` vs `refused`) | F4 mutations (each writer back to a bare insert → red) |
| Mutation F3: `invited_admin` return removed turns "refuses an address with a live invitation" red (`expected +0 to be 1`) | The coordinator's full `pnpm check` that comes next |
| F5, F6, F7, simplifications: read in the diff. The wrapper now uses `^ep-[a-z0-9-]+$`. The F7 test covers an operator who was invited | |

All seven findings are resolved. RG-T9 records the bootstrap trade-off. I didn't write the uncommitted edit to `docs/decisions-inbox/feat-h2-registry.md` that adds RG-T9 and RG-T10. The RG-T10 follow-up for the invite-side gap is correct.

Remaining notes, none blocking:
1. [low] admin.ts bootstrap: suppose the bootstrap grant is revoked and no operator remains. The `activeCount` pre-check passes and asks for `yes`. The PK conflict then prints "REFUSED: an operator already exists". That's false: none exists. Say "bootstrap has already run once; use admin:grant" instead. admin:grant on the still-existing bootstrap user is the recovery path.
2. [low] admin.test.ts race test: it relies on a 300 ms sleep for the second connection to reach its insert. If a slow runner misses that window, the second run starts after commit and is refused by `NOT EXISTS`, not by the primary key. The test then passes without exercising the race, so a regression could pass too. It's not flaky-red. To make it deterministic, poll `pg_stat_activity` / `pg_locks` until the second connection is waiting.
3. [low] F4 is partly done: `insertOnboardedShelter` is pinned, but the `recordAnimalsImported(..., insertedCount)` call inside onboard's `main()` still isn't asserted. The animal loop needs R2. Record it as a follow-up, or extract the loop's count-and-record step.

TESTS
db: 4 files, 41 passed. Mutations: 2 of 2 red. Harness not run.
