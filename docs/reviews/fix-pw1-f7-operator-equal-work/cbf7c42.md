Verdict for cbf7c42787c2ab73cee1c5f7f402237468040d61: PASS WITH NOTES

Independent Tier 1 review of PR #164 (`fix/pw1-f7-operator-equal-work`), pinned to
`cbf7c42787c2ab73cee1c5f7f402237468040d61` over origin/main `5946366`. At review time the branch head
was this SHA (one commit, the PR still a draft, mergeable_state clean). Method:
`.claude/agents/opika-reviewer.md`. Read-only: mutations were made in the checkout, reverted with
`git checkout --`, and `git status` was confirmed clean after each one.

```
VERDICT: PASS WITH NOTES
```

## Verified vs taken on trust

| VERIFIED (ran it / read it) | TAKEN ON TRUST |
|---|---|
| (1) The guard's read is Better Auth's own read. Installed `better-auth` **1.6.33** (catalog pin and `apps/web/node_modules/better-auth/package.json`). `dist/api/routes/sign-in.mjs:287` calls `ctx.context.internalAdapter.findUserByEmail(email, { includeAccounts: true })`. The guard (`password-hooks.ts:347`) makes the same call with the same argument (`ctx.body.email`, which `findUserByEmail` lowercases on both paths). Since it is the same function (`dist/db/internal-adapter.mjs:483`, `findOne` on `user` with `join: { account: true }`), the statements are the same by construction, in the same order: the user read, then the account read. | That the statements are identical on neon-http. Smoke step 15 compares the statements for it; Oleksii runs it on real Neon, and I cannot. |
| (2) The trace test (`password-flows.test.ts` "similar timing …"). `wrong` is pinned to a transcribed literal list of 9 steps, not to a constant the code renders. The operator's case is `toEqual(wrong)`, with no conditional around it. My mutations: **M1** the guard's read removed → red, `expected [ 'perIp.check', …(6) ] to deeply equal [ 'perIp.check', …(8) ]`. This is word for word the builder's recorded failure, so the cross-check passed. **M2** `includeAccounts: false` → red, `…(7)` vs `…(8)` (no `select:auth_account`). **M4** the read moved after the hash → red, because the order differs (`scrypt, select:auth_user, select:auth_account`). | — |
| (3) The operator is still refused. "the same status and the same body, whatever the cause" passes: 401, no session cookie, one body, `INVALID_EMAIL_OR_PASSWORD`. **M3** (the guard's `throw invalidCredentials()` removed) → three tests go red: the timing trace (`['scrypt','scrypt']`, plus `insert:auth_session … delete:auth_session`), F6's "every sign-in makes the same two reads …", and smoke step 15 (`statements 7 against 5`). The added line logs nothing, and nothing in it carries the address, a token or a password. | — |
| (4) The F6 check runs on every sign-in, where it did: `race.begin` comes before the grant read and `race.settle` after the hash, and the diff leaves both unchanged. All the F6 interleaving and forced tests in `password-flows` and `sign-in-race.test.ts` pass. The new comment in `sign-in-race.ts` matches the forced test's setup: the write is held uncommitted before the sign-in starts. | — |
| (5) Smoke step 15. It runs inside `runAuthSmoke`, so it is behind the same `smokeTarget` / `--expect` / production refusal as the other steps. Its detail line prints only statuses, booleans and counts, never a connection string. Both 401s, the same body, no cookie, and the same statement names in order are asserted unconditionally. The step-name list in `neon-auth-smoke.test.ts` gains the one entry. Local run passes. Mutations M1 and M2 turn it red. | Its real-Neon run (Oleksii's). |
| (6) The unknown address's residual is recorded as a residual (PW1-F7-R1, with "Left as is"). The test still pins it: `wrong.filter(step => step !== "select:auth_account")`. | — |
| (7a) The doc comment at `password-hooks.ts:309-314` matches the code's order: the delay charge, `race.begin`, the grant read, `findUserByEmail`, the hash, `race.settle`, the refusal. | — |
| Commit body: pasted `pnpm check` (5270 passed, 1 skipped) and two mutations. | The builder's full workspace `pnpm check`. I ran the parts listed under Tests, not the other packages' suites or `build:web`. |

## Findings (most severe first)

None blocking.

1. [low, docs] `docs/shelter-passwords.md:228-233`. The PW1-F4 paragraph still says, in the present tense, "the operator skips both of Better Auth's reads". The dated PW1-F7 note added just below supersedes it, but a reader of §5 now meets two contradictory present-tense statements. Suggest adding "(until PW1-F7, below)" to the old sentence. A docs edit, which can ride a later push.
2. [low, test granularity] `statementName` compares tables, not SQL. So the trace test and step 15 pin "the same tables, in order", not "the same SQL". Identical SQL is guaranteed by the guard calling Better Auth's own function, which I verified by reading 1.6.33. It is not proven by a test. That is acceptable (PW1-F7-D1 records why), but a later swap to a lookalike repository read would stay green.
3. [info] `packages/db/src/schema/auth.ts:163` says the only writers of `super_admins` are `admin:grant` and `admin:revoke`. Smoke step 15 now writes a grant too, on the disposable branch, for a fictional fixture user, like the tests' fixtures. The comment means production writers. Suggest adding "outside tests and the auth smoke" if it is ever touched.
4. [info, carried from PW1-F4's review, 7b] origin/main's `docs/decisions-inbox/fix-pw1-f4-signin-timing-trace.md:5` still says "Stacked on PW1-F6 (#159, in its Tier 1 review)", though #159 has merged. That will be fixed in a separate docs PR; not blocking here.
5. [info] My apps/web count was 2732 tests on Node 24; the commit body says 2724 on Node 22. All passed in both runs, so no test was lost; the counts are not comparable across the two environments.

## Simplifications

None. The change is one call, its type member, and the test and smoke updates.

## Stop reason

None. Before merge, Oleksii's real-Neon `kabinet:neon-auth-smoke` (step 15) is still required, as the PR says. **Migration: none**, confirmed: the diff touches no schema or migration file.

## What I could not run

- Real Neon (no access, by the guardrails); the smoke ran locally on postgres-js only.
- The pre-installed Chromium is build 1194 and the repo's Playwright 1.62.1 expects 1234, the same mismatch the builder hit. I ran the harness with `PLAYWRIGHT_BROWSERS_PATH` pointed at a scratchpad directory of symlinks to the installed build. No repo change.

## Tests (Node v24.22.0, local Docker `postgis/postgis:17-3.5`)

- `password-flows.test.ts` + `sign-in-race.test.ts` + `neon-auth-smoke.test.ts`: 3 files, 62 passed.
- apps/web full unit suite: 151 files, 2732 passed, 0 failed.
- `pnpm typecheck`: clean. `pnpm lint`: exit 0 (155 warnings, 1 info, no errors).
- `pnpm --filter @opika/web test:harness`: 251 passed (3.9m).
- Mutations M1–M4 above: each one red, then reverted.
