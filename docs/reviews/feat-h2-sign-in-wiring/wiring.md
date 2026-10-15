# Review: feat/h2-sign-in-wiring (uncommitted, off bacf309), Tier 1, pass 1

VERDICT: STOP (blocks the merge, not the commit; commit and push are fine per the 2026-09-06 amendment)

VERIFIED | TAKEN ON TRUST
---|---
Touched unit suites run: web 8 files 191/191 (build-env, env, auth, confirm-route, no-self-serve-yet, production-sign-in, production-wiring, neon-auth-smoke); i18n copy-status 45/45; db neon-smoke.test 10/10 | Full `pnpm check` (2484 / harness 225): the builder's log tail read, not re-run
`tsc --noEmit --incremental false` clean for apps/web and packages/db | The "real `next build` with VERCEL_ENV=production" both ways: no log of it in the scratchpad
Live catalogue: production shape gives `copy_pending (kabinet.confirm.rateLimited)`, so **sign-in stays OFF at merge** (production-wiring test, plus mutation 1 below) | Commitments 1, 3, 5, 8 (not touched; not re-derived)
`signInEnvProblems`/`assertBuildEnv` with his reported values (apex URL, noreply@mail.…, hello@…, 64-char secret) gives `[]` and the build passes; `www.` is refused; Preview gives `[]` | That production's BETTER_AUTH_SECRET is 32+ characters (not knowable from names)
A1/A2 byte-equal to his verbatim rows 91/89 (inbox EM-Q6), checked by script; A1 is paragraph −2 of 5 in §7 | That the harness's second server leaves no orphan on a failed beforeAll (log says none for the green run)
Smoke refusal paths, run with fake hosts only: local URL, `--expect` = prod, mismatch, PROD_NEON_ENDPOINT unset all print REFUSED before `createDatabase`. The auth smoke uses capturing senders and has no `fetch`, so no Resend call |
Mutations I ran (all red, restored byte-for-byte): copy gate removed → 6 production-sign-in + 1 production-wiring tests; secret floor removed → 5 tests across build-env/env/production-*; 429 → "invalid" card → auth.test "301st call" |
Commitments 2 (`KabinetShelterViewSchema` picks no engagement), 4 (`sendMagicLink` sends only if `hasUserWithEmail`, `disableSignUp`), 6/7 (shelter writes refused; registry repo never touches `confirmedAt`) |

FINDINGS (most severe first)
1. [STOP, merge] uk.ts:807, 781: merging puts A1/A2 live while production sign-in is OFF. A2 says «Кабінет притулку вже є», and nobody can open it (`/kabinet` 404). EM-Q1(b) says the paragraph ships "in the commit that turns production sign-in on", and this commit does not turn it on.
   Failure scenario: merge → `/prytulkam` claims a kabinet that 404s.
   Evidence: live-catalogue test pins `copy_pending`. Nothing mechanical enforces the merge block. It lives only in prose (inbox WI-Q3, h2-next-prs). Two ways to fix it: block the merge until WI-Q3's Ukrainian lands in this PR (the squash keeps EM-Q1's "same commit"), or move A1/A2 into the commit that lands WI-Q3.
2. [STOP, env] build-env.ts:66 `locationSecretProblem` is checked at boot only (WI-T2). CRON_SECRET and RATE_LIMIT_KEY_SECRET are checked at build *and* boot. A bad key therefore deploys and then 500s the **whole public site**, the outage the old comment existed to prevent. Recommend production-only in `assertBuildEnv` too.
3. [STOP, env] WI-Q1 (the build checks validity as well as presence) is Oleksii's call. The built default is sound.
4. [note] The commit message says "Turns production sign-in on". Commitments row 6 and brand-voice.md say "A shelter can now open the kabinet". All three describe the state after WI-Q3, not this commit's.
5. [note] kabinet.harness.ts:143 checks the 48px target and the focus ring of «Вийти», not that pressing it signs out.
6. [note, outside the diff] handlers/animals.ts:401 `reason: "has_activity"` tells a shelter that a draft was swiped. Commitment 2 is at risk when K2 enables shelter writes.
7. [minor] Presence uses `trim()` but `signInConfigOf` does not, so the build and the runtime disagree on a whitespace-only secret. The build is stricter, so this fails closed.

SIMPLIFICATIONS
- production-mail.ts:72 cache-key rebuild exists only for tests. A plain once-per-process singleton is enough. If this is wrong, a test that changes the env would read a stale pair.
- sign-in-env.ts:120 the "unreachable" `provider_not_configured/auth_config_missing` arm could fold into `default`.

STOP REASON
Needed from Oleksii, ranked: (1) the Ukrainian for `kabinet.confirm.rateLimited` (WI-Q3), or his choice to hold A1/A2 out until it lands; (2) confirm WI-T2, and whether LOCATION_HMAC_SECRET also joins the build check; (3) confirm WI-Q1 (a)/(b)/(c).

TESTS
web 191 passed (8 files) · i18n 45 passed · db neon-smoke.test 10 passed · tsc clean (web, db)
