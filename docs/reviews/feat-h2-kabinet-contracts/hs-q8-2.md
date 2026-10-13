# Review pass 2: HS-Q8 fixes (uncommitted, vs 2c48d9b). Scope: kabinet/auth.ts, principal.ts, auth.test.ts

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Scoped suite: auth.test.ts, 30 passed | Builder mutation 2 (dropping principalOf's check means only the second test fails). It is consistent with the test's design: the lenient clock keeps the hook from firing
Better Auth 1.6.33 `toAuthEndpoints` routes every `auth.api.*` call through `dispatchAuthEndpoint`, which runs `hooks.before` with matcher `() => true`. Same path as the HTTP router, so it covers every endpoint, accept-invitation included | Builder mutation 3 (dropping cookiePrefix). Probe D below shows the prefix is live
Probe A: server-side `auth.api.getSession({headers})` on a 31-day session returns `null`, and the session row count goes to 0. The hook fires for principalOf's call path | Neon latency of the extra query (not measured)
Probe A2: `principalOf` with `now` a year in the past, on a 31-day session, returns `anonymous`. The hook alone refuses it |
Probe B (mutation spot-check, equivalent to removing the hook's delete, via `deps.now` a year back): get-session keeps the over-age session. So "get-session reports no session past 30 days" would go red. Matches builder mutation 1 |
Probe C: `Authorization: Bearer <raw token>` with no cookie gets `null`. No bearer plugin is installed and core reads only the signed cookie, so there is no bypass today |
Probe D: when the hook deletes the session, get-session clears `kabinet.session_token`, `kabinet.session_data` and `kabinet.dont_remember` (Max-Age=0). No `better-auth.*` cookie. Finding 2 of pass 1 is fixed |
Probe E: an unsigned session cookie returns null and the row is untouched (getSignedCookie rejects it) |
Fix 3 assertions read: get-session returns the user's email through the `__Host-` cookie, and sign-out clears it with Max-Age=0, Path=/, Secure, and no `better-auth.` cookie. Each is unconditional (no assertion sits behind an `if`) |

FINDINGS (most severe first)

1. [low, latent] auth.ts:133. Hook ordering: `getHooks` runs the user `hooks.before` *before* plugin before-hooks. If a bearer plugin (or anything else that rewrites the `cookie` header in its own before-hook) is ever added, it would inject the session cookie *after* our check. Our hook would see no cookie, and the absolute cap would then hold only in `principalOf`, which is the pass-1 gap again. There is no exposure today (probe C). Fix: one line in the hook's doc comment saying a header-rewriting plugin must enforce the cap itself, or the cap moves into a plugin hook ordered last.

2. [note] auth.ts:133-144. Each Better Auth request that carries a cookie now does `findSession` twice (once in the hook, once in the endpoint). On neon-http that is an extra HTTP round trip per get-session and per kabinet RPC (`principalOf`). It is acceptable at this scale. Record it in case latency is ever looked at.

3. [note] Cross-site: a top-level cross-site GET (SameSite=Lax sends the cookie) can only trigger deletion of the holder's own session, and only once it is already over 30 days, which `principalOf` already treats as anonymous. A subresource request does not carry a Lax cookie. Not harmful.

SIMPLIFICATIONS
- auth.ts:133. A possible alternative to the hook: `databaseHooks.session.update.before` clamps `expiresAt` to `createdAt + absoluteMs`, so Better Auth's own expiry check enforces the cap. That needs no extra query and isn't affected by hook order. If it's wrong: a session created right at the cap stays valid until the next update, and the row is not deleted. Optional, not a blocker.

TESTS
`pnpm --filter @opika/web exec vitest run --project api src/kabinet/auth.test.ts`: Test Files 1 passed (1), Tests 30 passed (30). That count covers apps/web src/kabinet/auth.test.ts only. The temp probe file (src/kabinet/zz-probe-hsq8.test.ts, 6 probes) and its scratch output have been deleted.
