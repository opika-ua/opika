# Review: feat/h2-invite-confirm, f86c7cd (Tier 1, synchronous, pass 2: answers the 9bd1411 STOP)

Process note: f86c7cd was committed locally, not pushed, **before** this Tier 1 review, on the
builder's instruction. CLAUDE.md's loop says Tier 1 reviews before the commit. Judged on merits.

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
`strict-origin` on GET 200/400, POST 303/400/403, 404, 405: `confirm-route.test.ts` "headers on every response" green. No global Referrer-Policy in next.config/proxy/layout to conflict with it. | The harness spec's green run and both recorded harness mutations. Not re-run (port 3100 collision, as instructed). Present, specific, and consistent with the code as I read it.
The Origin check is byte-identical (`!== origin`, line 119). Only the comment changed. | Firefox/WebKit, run once locally. Stated honestly: not in CI; real Safari and Safari < 16.4 named as untested.
My mutation: also accept `Origin: "null"` → `× refuses a POST from Origin: null with 403…`, `expected 303 to be 403`. Restored, tree clean. | That the IN-T8 quote is word-for-word what Oleksii sent. I have no source message. Its form is right: verbatim is labelled and kept apart from the "Implemented:" paraphrase.
The console sender is chosen only when `NODE_ENV !== "production"` (`auth-route.ts:25`). Vercel always runs with NODE_ENV=production. `productionSignInOf` never selects it. It cannot be selected in production. | That CI's Postgres service can host the second server. The branch is not pushed.
Spec reasoning: `same-origin` or no policy → masked Referer mismatch plus the `token=` count goes red. A GET that consumed the token → POST 400 → red. | 
CURSOR_HMAC_SECRET / R2_PUBLIC_BASE_URL moved with identical literals (diffed). | 
`next start` runs in-process (`next-start.js` → `startServer`, no fork), so `server.kill()` ends it. afterAll runs even when beforeAll fails. | 

## FINDINGS (most severe first)

1. **[minor] `kabinet-confirm.harness.ts:65` checks setup, not behaviour. The 404 does not pin the production gate.** The main webServer sets no `BETTER_AUTH_*` (`playwright.config.ts` env), so the 404 comes from `missing_config`.
   - Failure: delete the `NODE_ENV === "production"` branch and this test stays green. The commit's "the production gate is pinned" and the header comment's "(and asserted)" claim more than the test does. The real pin is the unit test `auth.test.ts:482`.
   - Fix: add the test `BETTER_AUTH_SECRET`/`URL` to the main webServer env, so a 404 can only mean the production branch fired. Or reword the claim and drop the test as duplicate coverage.
   - Evidence: reading only. Not run.

2. **[minor] The token can reach a CI artefact.** `trace: "retain-on-failure"` records `page.goto(link)` and the network log, token included. CI uploads `apps/web/test-results/`. The header comment (lines 21–22) says the token is never included in a failure.
   - Impact is low: a test token on a dropped disposable database.
   - Fix: `test.use({ trace: "off" })` in this file, or narrow the comment.

3. **[minor] After rebase onto #92, the orphan check does not cover the second server.** `harness-orphans.ts` matches `next start` on this checkout's `harnessPort()` only. The spec's server is on a random `freePort()`.
   - Failure: the worker dies mid-run and the extra server outlives the run unreported.
   - Fix: derive its port from the checkout too, and include it in the check, or widen the regex to any `next start` from inside the checkout.
   - Expect a `playwright.config.ts` conflict (PORT) on rebase.

4. **[nit] :134–136** says the connection can't be closed. That reason is false: `Database` is `PostgresJsDatabase`, and `db.$client.end()` is reachable. Close it in a `finally`.

5. **[nit] :202–204.** Once rebased, `/kabinet` exists (#93), so "the 404 page's own assets" goes stale. The spec could then assert the landing page too.

Previous findings:
- **#2** (redirect to a 404): resolved on main via #93. Closes on rebase.
- **#3** (BETTER_AUTH_URL canonical host): handled in design. `productionSignInOf` refuses unless `BETTER_AUTH_URL` equals `PRODUCTION_ORIGIN` (the apex), and it is unit-tested. It is not wired yet, so it is effective only when production sign-in is wired. Still open until then. Not this row's job.

## SIMPLIFICATIONS
- `kabinet-confirm.harness.ts:65`: make it a real gate test (finding 1) or delete it. As written it duplicates `auth.test.ts:482` with a weaker cause.

## TESTS
- apps/web `confirm-route.test.ts` + `auth.test.ts`: 2 files, 44 passed.
- Mutation: 1 failed / 11 passed (12), as intended. Restored.
- Commit body pastes the full `pnpm check`: workspace total 1824, harness 219 passed. Harness not run here, as instructed.
