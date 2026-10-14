# Review: feat/h2-kabinet-hardening (uncommitted, off 5453e3c), Tier 1

VERDICT: STOP (blocks the PR, not the commit; see STOP REASON)

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Builder's `pnpm check` in check-hardening.txt: harness 219 passed / 3 skipped, no orphan process; unit totals as quoted in msg-hardening.txt | Unit totals per package (I read only the harness tail) |
| Touched suites re-run: apps/web kabinet/*, api/kabinet-cross-tenant, api/kabinet-registry-access, proxy.test: 14 files, 290 passed. contracts kabinet: 199 passed. DB-backed suites ran against the local DB | The proxy's per-user path end to end (proxy.test runs with auth unavailable, so userId is null; per-user is covered only in page-limit.test) |
| better-auth 1.6.33 / @better-auth/core 1.6.33 source: `getIp` returns null when `disableIpTracking` is set; `resolveRateLimitConfig` returns null when `!ip && disableIpTracking`; `rateLimit.enabled ?? isProduction`; `createSession` writes `getIp(...) \|\| ""` and `headers.get("user-agent") \|\| ""`. No user-agent option exists | Real-Neon behaviour (none claimed) |
| Only `sign-in/magic-link` goes through our `signInAllowed`. Nothing of ours limits verify, get-session or sign-out | |
| Mutation (spot check): `disableIpTracking: false` → `expected '203.0.113.77' to be ''` at auth.test.ts:374. Same as the builder's record. Restored | Other 7 recorded mutations: present, each names a break and its failure text |
| My mutation: a new non-test file doing `const shelterWrites = { kind: "open" } as const; return { ...base, shelterWrites }` → source scan **still passes** (2 passed). Removed | |
| Every non-test `shelterWrites` setter: route.ts and home.ts pass the constant, rpc-route passes the dep through. No production path builds `open` | |
| Inbox quotes match the relayed text word for word. Relayed status and paraphrase are marked as such | |

## FINDINGS (most severe first)

1. **[medium] shelter-writes-refused.test.ts, source scan.** Shorthand properties get past it (see the mutation above), and so do computed keys. The type system allows both. Fix: give the open variant a unique name (for example `open_for_handler_tests`) and scan non-test files for that literal, allowing only the type line in access.ts. A plain `"open"` scan won't work because `features/reveal` already uses `kind: "open"`.
2. **[low] access.ts:193.** `SHELTER_WRITE_POLICY` is a mutable object typed as the union, so `SHELTER_WRITE_POLICY.kind = "open"` type-checks anywhere. Wrap it in `Object.freeze`.
3. **[low] rate-limits.ts comment.** It says the split keeps the router out of proxy.ts, which is true. But proxy.ts now imports `kabinet/runtime`, which pulls Better Auth, the drizzle adapter and getDb into the proxy. The proxy matches every route, `/tvaryny` included. Build passes, but nobody measured the cold-start cost. Either say so in the comment or move `kabinetPageUserId` and the limiters into a lighter module.
4. **[low] Comment accuracy.** The access.ts doc says `open` exists for "handlers.test.ts, kabinet-cross-tenant.test.ts", but registry.test.ts:476 also opens writes. The test header says a new write is "covered without an edit to this file", but `toHaveLength(13)` forces one. The tripwire itself is good; the sentence is wrong.

Correct as built: the refusal sits in `decideAccess`, the one choke point both routers use. Access is checked before input validation (13 × 403 with junk input, nothing written). Reads answer 200 and the support view still gets FORBIDDEN. Registry writes are untouched. `/kabinetx` and `/api/kabinet` don't match. The limiter fails closed (RL-1) on both paths. If a session read throws, the request answers 500 on both paths. The 429s are real. The error message is English API text, not UI copy. No brand strings.

## SIMPLIFICATIONS
- rpc-route.ts: drop the `KABINET_RATE_LIMITS`/`KabinetLimiters` re-export and point handlers.test.ts:26 at `./rate-limits`. It has no other importer, so nothing breaks.

## STOP REASON
Rate limits are on the STOP list, and the instruction collided with one. Ranked:
1. `disableIpTracking` also turns off Better Auth's production rate limiter. That leaves `magic-link/verify`, `get-session` and `sign-out` with no limit at all once the 503 lifts. Oleksii has to choose: accept that, or put a per-IP `kabinetLimiters` (or `signInLimiters`) check in front of all of `/api/auth/*`. The builder flagged this correctly in KH-Q6 and did not resolve it silently.
2. Already there before this diff, surfaced by it: `auth_session.token` is stored unhashed, which diverges from the hashing rule in decision #13. Needs recording, or a fix, before the 503 lifts.
3. KH-Q6 user agent: no option exists. Keep it as is, or allow a `databaseHooks` rewrite.

## TESTS
apps/web (touched): 14 files, 290 passed. packages/contracts kabinet: 1 file, 199 passed.
