# Review: merge of #95 into feat/h2-invite (8cb4c63) + merge fixes (223f801)

Tier 1, synchronous. Worktree D:\opika-worktrees\invite, not pushed (origin at 289f6cd).

VERDICT: STOP (blocks the merge only, not the commit). One rate-limit decision needs Oleksii's answer. The code is sound.

| VERIFIED | TAKEN ON TRUST |
|---|---|
| `git diff 289f6cd 8cb4c63` and `e260933 8cb4c63` on proxy.ts, context.ts, rpc-route.ts, auth.ts, contract.test.ts: each side's behaviour is present (both gate exemptions; `invites`, `linkBaseURL` and `shelterWrites` all in the context and passed by the route; #94's confirm/sendMagicLink/FORWARDED_AUTH_PATHS changes plus #95's `limiters`, `hooks.before` and `disableIpTracking: true`) | The builder's full `pnpm check` (2305 unit tests, harness 222 passed / 3 skipped, orphan line clean, Node 24.21.0). I ran on Node 22.22.3 |
| `git grep ALREADY_A_MEMBER`: no hits in code, only in docs and history | Vercel overwrites a client-sent `x-vercel-forwarded-for` (Vercel's docs, cited in client-ip.ts) |
| The neon-smoke steps are numbered 1–18 and the test asserts `outcomes.length` is 18 | That the step-18 renumber passes on real Neon (Oleksii's smoke rerun is still open) |
| Invite side adds only registry procedures, no shelter ones. shelter-writes-refused.test passes. The contract matrix still counts 13 shelter writes | Next.js does no method override (none exists in Next 16, as far as I know) |
| `inner key == proxy key`: `clientIp` reads only the three IP headers, and `forwardedClientHeaders` now copies all three verbatim. confirm-route.test pins both cases | The other four builder mutations. I spot-checked one class of change myself (below). The other four each name a test and a result |
| My own mutation: dropped the `method === "POST"` condition from `isChargedKabinetPageLoad`. Result: proxy.test:286 "expected 200 to be 429" and page-limit.test:51 "expected false to be true". File restored |  |
| tsc --incremental false: web 0, db 0 |  |

FINDINGS (most severe first)

1. [Medium] docs/decisions-inbox/feat-h2-invite.md, row IN-T15 (also page-limit.ts:16-17 and auth.ts:226). The row and both comments say the confirm verify is charged "per IP, then per user". It is charged per IP only. `forwardedClientHeaders` forwards no cookie, so `hooks.before` never finds a session on this request. The verify now arrives only through the confirm POST (IN-Q11), so the per-user leg on `/magic-link/verify` can never run.
   Failure scenario: a signed-in browser posts the confirm form. Before the merge fix, the proxy charged that POST per IP and per user. Now only the per-IP charge happens. Oleksii would be approving a description that isn't the behaviour.
   Evidence: confirm-route.test asserts `charged == ["perIp ip:…"]` and its own comment says "no per-user charge". Fix the row and the two comments before he answers. The behaviour itself is acceptable: the 300/min per-IP backstop still holds.

2. [Low] The uncharged POST matcher is exact, and every mismatch fails safe. A trailing slash, other encodings, HEAD, other methods and other `/kabinet` POSTs are all charged (page-limit.test pins `POST /kabinet/vkhid` as charged). That path is a route.ts with no server actions. A POST refused before the verify (bad Origin, bad token shape) is now charged nowhere. It reads no database, but it does parse `formData` uncharged. Accepted as documented. Unverified: the cost of a large body.

3. [Low] Off Vercel, a client chooses its own bucket through `x-vercel-forwarded-for`. Forwarding that header does not widen this: the proxy's `clientIp` already trusted it, and before this fix `x-forwarded-for` gave the same control.

Agreed:
- The 429 leaves the token unspent. auth.test retries from another IP and gets 303 with a session cookie, and removing the mapping turns it red (builder's mutation).
- No new Ukrainian copy. The 429 reuses the proxy's existing English "Too Many Requests".
- The invite-landing rewrite is honest. The first test would go red if Better Auth's own limiter came back.
- The self-heal accept is correctly outside `ShelterWritePolicy`. It writes membership and invitation rows, never shelter data, and it is the approved IN-Q12/IN-Q13 path.

SIMPLIFICATIONS
- `CONFIRM_PATH` (auth.ts) and `SIGN_IN_LINK.path` (email-links.ts) are the same literal, kept equal by a test. Make one an alias of the other. What breaks if this is wrong: nothing, the test already enforces equality. Comes from the invite side, so schedule it rather than doing it here.

STOP REASON
IN-T15 (1) moves where the kabinet per-IP limit is charged for the sign-in POST (proxy → `hooks.before`). Rate limits are on the STOP list (item 5). It is recorded as "default-taken", but a Tier 1 decision blocks the merge until Oleksii answers. Needed from him: accept or reject "the confirm POST is charged once, per IP only, by `hooks.before`; the proxy skips that POST". Correct the row's "then per user" first (finding 1). Recommendation: accept.

TESTS
- apps/web, 9 files (proxy, page-limit, confirm-route, auth, invite-landing, invitation-accept, shelter-writes-refused, script-history, handlers): 260 passed out of 260.
- contracts contract.test: 210 passed out of 210.
- db neon-smoke.test (local postgres-js): 10 passed out of 10.
- Mutation run: 2 failed / 81 passed, as expected; restored afterwards.
