# Review: HS-Q8 delta (uncommitted, vs 2c48d9b): kabinet session mirrors decision #13

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Scoped suite: 67 passed | Builder's mutations 2 and 3 (useSecureCookies stacking, expiresIn 30d)
Better Auth 1.6.33 reads the session cookie only through `ctx.context.authCookies.sessionToken.name` (getSession, sign-out, refresh, bearer, multi-session). `getSessionCookie` (cookies/index.mjs:214) hardcodes `${prefix}.session_token` / `__Secure-`, but nothing in apps/web calls it (grep) | That nothing will call `getSessionCookie` / `getCookieCache` later (e.g. in a proxy/middleware)
Probe over HTTPS: verify sets `__Host-kabinet.session_token=…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`. get-session with that cookie returns 200 | Dev name behaviour in a real browser
Probe: sign-out deletes the row and expires `__Host-kabinet.session_token` and `__Host-kabinet.dont_remember` with the same Path/Secure/SameSite/HttpOnly | 
Probe: a session aged to 31 days gets 200 from `/api/auth/get-session`, but `principalOf` returns `anonymous` | 
Mutation (mine, done with vi.mock, no source edit): absoluteMs + 2 min. Red at auth.test.ts:275, "expected { kind: 'no_role' } to deeply equal { kind: 'anonymous' }", plus the pin test | 
Doc comment "lapses between 6 and 7 days after last use" matches Better Auth's refresh rule | 
Inbox HS-Q8: the verbatim quote and the parenthetical paraphrase are kept apart | 

FINDINGS (most severe first)

1. [medium] auth.ts:31-35, principal.ts:24. The 30-day cap holds only in `principalOf`. Better Auth itself still treats an over-age session as valid.
   Failure scenario: a session created 31 days ago and used daily. The forwarded `/api/auth/get-session` returns 200 with the session (the client shows "signed in"), while every kabinet call says anonymous. Worse: HS-Q7's accept-invitation endpoint goes through Better Auth's sessionMiddleware, so once it is forwarded, a session past the absolute limit can accept an invitation. The comment says the cap holds "where kabinet access is decided". Accepting an invitation is a kabinet access decision too.
   Evidence: the 31-day probe above.
   Fix: enforce the cap inside Better Auth so its own expiry check applies everywhere. For example, clamp `expiresAt` to `createdAt + 30d` on session update (`databaseHooks.session.update.before`, or a plugin hook). Keep `principalOf` as a second check. At minimum, document the get-session disagreement and add an obligation that the accept-invitation PR enforces the cap.

2. [low] auth.ts:136. Removing `cookiePrefix: "kabinet"` moved every cookie we don't name ourselves back to `better-auth.*`, without the `__Host-` prefix. Sign-out now emits `better-auth.session_data=; Max-Age=0` on the shared origin, and `account_data`, `oauth_state` and any plugin cookie would follow. Restore `cookiePrefix: "kabinet"`. Explicit `cookies.*.name` values take precedence over it, so the `__Host-` names don't change.
   Evidence: probe `ctx.authCookies` and the sign-out Set-Cookie list.

3. [low] auth.test.ts:229. The HTTPS test only checks the Set-Cookie on verify. Nothing pins that the `__Host-` cookie is read back by getSession, or that sign-out clears it with matching attributes. Both hold today (I probed them). But this is exactly what a better-auth upgrade could break, and the pin note relies on tests to catch upgrades. Extend the HTTPS test with get-session → 200 and sign-out → `__Host-kabinet.session_token=; Max-Age=0; Path=/; Secure`.

Answers to the questions asked: `dont_remember` already gets `__Host-`. The only cookies without our prefix are the ones in finding 2. No read path in 1.6.33 misses the custom name.

SIMPLIFICATIONS
None.

TESTS
`pnpm --filter @opika/web exec vitest run --project api src/kabinet`: Test Files 3 passed (3), Tests 67 passed (67), scoped to apps/web src/kabinet. Temp probe and mutation files deleted.
