# Review: feat/h2-kabinet-contracts, HS row 3 (uncommitted tree vs 715a039), Tier 1 synchronous

VERDICT: STOP. It blocks the merge, not the commit. Production answers 503 before Better Auth is built, so nothing reaches users. Fix findings 2 to 4 before committing.

VERIFIED (ran it) | TAKEN ON TRUST
---|---
kabinet api suite: 3 files, 59 passed | the builder's mutations other than the one below
db: kabinet-actor-repo + shelter-history, 13 passed | 0009 never applied outside local tests (the docs agree)
Spot-check: a stray `db.insert(authMember)` turns the copy-gate test red, and the message names A1–A3, §7/§9/§10 and B1 | access matrix rows past line 60
`drizzle-kit check` is clean; the snapshot prevId chains to 0008; no `tired_moondragon` ref outside `.git/index` | neon-http on any Better Auth path (finding 5)
Probe: verify of a no-user token → 302 `?error=new_user_signup_disabled`, no cookie, no user created | HS-Q4 scripts (`admin:revoke` never deletes): not in this row
Probe: secure cookie is `__Secure-kabinet.session_token; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`, no clash with `session`/`__Host-session` |
Probe: cross-origin `sign-out` with a cookie → **200** |
Probe: `auth.api.addMember(...)` created an `auth_member` row while every scan stayed green |
Read: HS-T2/Q7/Q3/Q2/Q5 conditions in code and tests; magic-link and drizzle-adapter source at 1.6.33 |

FINDINGS (most severe first)
1. [STOP item 5] auth.ts:73: the kabinet session cookie gets Better Auth's default lifetime and prefix: 7 days, sliding (`updateAge` 1 day), `__Secure-`. Nobody decided these. For adopters, decision #13 chose `__Host-` with an absolute plus idle expiry.
   Failure scenario: a shelter admin who signs in daily stays signed in forever.
2. [high] auth.ts:57: under vitest, Better Auth's `isTest()` sets `skipOriginCheck=true` (create-context.mjs:210). Every test, including the HS-Q7 upgrade gate, runs with CSRF and callbackURL validation off, and every `origin: BASE` header is decoration. The mode we test in is not the product.
   Fix: set `advanced.disableOriginCheck: false` explicitly, then add tests that a cross-origin cookie POST gets 403 and that verify with `callbackURL=https://evil` gets 403.
3. [high] no-self-serve-yet.test.ts:68/90: the HS-Q3 and HS-Q7 scans match by shape. They miss `db.insert(schema.authMember)` and `schema.authInvitation`: I mutated both and got 5/5 passing. They also miss server-side `auth.api.addMember`, `createOrganization` and `acceptInvitation`, which skip `FORWARDED_AUTH_PATHS` entirely (the addMember probe created a member).
   Fix: allow an optional `\w+.` prefix in the regexes, and allowlist `auth.api.<name>` in non-test source (`getSession` only).
4. [medium] auth.test.ts:142: "an unknown address never becomes a user" never calls verify. `disableSignUp` is read only in the verify handler, so deleting it leaves this test green. My probe above is the real test; land it in place of this one.
5. [note] neon-http: by source, the pg path of the adapter never opens a transaction, uses `.returning()`, and reads `rowCount`. That is a reading, not a run. Exercise sign-in, verify, getSession and accept-invitation on a real Neon branch before any PR lifts the production 503.
6. [low] auth-route.ts:87: the rate-limited branch skips the verification INSERT, so it answers faster. That leaks "this address is over budget", not whether the address exists. Accepted unless you object.

SIMPLIFICATIONS
- rate-limit.ts:322: `apiRateLimiter` could be `sharedRateLimiter({name:"api",…})`. That needs a check: its Upstash prefix must keep the same string, or live budgets reset once.

STOP REASON
Kabinet session cookie attributes. From Oleksii I need: (a) absolute lifetime, (b) idle timeout, (c) `__Host-` (possible: Path=/, no Domain) or `__Secure-`. Recommended: mirror decision #13, which is `__Host-`, 30 days absolute and 7 days idle, or shorter for an admin surface.

TESTS
apps/web api project (src/kabinet): Test Files 3 passed, Tests 59 passed. packages/db (2 files): Tests 13 passed. The temporary probe and mutation files are deleted, and the tree is unchanged.
