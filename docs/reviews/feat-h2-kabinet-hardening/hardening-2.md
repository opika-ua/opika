# Review — feat/h2-kabinet-hardening, uncommitted delta on f9fe311 (pass 2, Tier 1)

VERDICT: STOP (blocks the merge only, not the commit; two defaults in STOP-list areas still need Oleksii's word. Code otherwise passes, with notes)

VERIFIED | TAKEN ON TRUST
--- | ---
A: 9 touched apps/web suites run, 299/299 passed; auth-expiry-repo 4/4; neon-smoke (local) 10/10 | Oleksii's answers as "relayed, verbatim": I can't trace them to his own message
A: `ctx.request` is undefined only for direct `auth.api.*` calls. The one server caller (`principal.ts:54`) passes headers only. Every HTTP request goes in through `handleKabinetAuth`, then `auth.handler`, then the router, so it always carries a request and can't pass itself off as in-process | Vercel's cron sending `Authorization: Bearer <CRON_SECRET>`, and running on production only (Vercel docs, not exercised)
A: `/api/auth/*` charged once: the proxy charges only `/kabinet` paths (`page-limit.ts:9`) and the route charges only sign-in. A bad-token verify costs exactly 1 unit (the 300 calls before the 429 pass). Upstash `check` returns false on error (`rate-limit.ts:188-190`), so it fails closed like RL-1 | KH-T4 timings (720/230/225 ms)
B: guard read from `process.env` inside `accessOrThrow`; through the served route: 500 with no write, and the read answers 500 too | The `db:neon-smoke` step 15 run on real Neon (stated as pending; correctly recorded)
D: better-auth 1.6.33 is strict `<` everywhere this matters: `session.mjs:182`, `internal-adapter.mjs:754` (consume), `:638` (its sweep uses `lt`). Repo uses Drizzle `$with` with delete…returning, no `.execute()`. Boundary test present. Route is `ƒ` (dynamic) in the build log |
D: `isCronPath` matches the exact string only; any other spelling falls through to the gate (403), so it fails safe. Boot check fires only when `VERCEL_ENV=production`: preview, harness and local dev are unaffected (env.test cases) |
E: magic-link `storeToken: "hashed"` uses Better Auth's `defaultKeyHasher`, an unkeyed SHA-256 (`verification-token-storage.mjs:4`) |
My mutations: (1) prefix exemption gives 4 failures, "expected 200 to be 403" (matches the builder's record). (2) Bare `import "./kabinet/runtime";` in proxy.ts: **21 passed** (finding 1). proxy.ts restored, diff stat unchanged |

FINDINGS (most severe first)
1. [medium] apps/web/src/proxy.test.ts `STATIC_IMPORT` / `heavyImports`: the guard against loading Better Auth in the proxy misses three ways in. A side-effect import has no `from`. A non-relative `@opika/db` matches neither the walk nor the filter. A top-level `await import()` isn't seen either.
   Failure scenario: someone adds `import "./kabinet/runtime"` to proxy.ts, Better Auth loads on every cold start again, and the suite stays green.
   Evidence: the mutation above, 21/21 green. Fix: match `(?:import|export)\b[^;]*?"([^"]+)"`, and add `^@opika/db$|^postgres|^drizzle-orm|^@neondatabase` to the filter.
2. [low] apps/web/src/kabinet/auth.ts `LIMITED_AUTH_PATHS` is opt-in, with nothing tying it to `FORWARDED_AUTH_PATHS`. Any path added later is unlimited, for example accept-invitation in the registry PR.
   Failure scenario: the route forwards a new path and Better Auth's own limiter stays off (`disableIpTracking`), so that path has no limit at all.
   Fix: a test asserting that every forwarded path except `sign-in/magic-link` is in `LIMITED_AUTH_PATHS`.
3. [low, docs] docs/onboarding-a-shelter.md: "nothing else changes" is true, but should say exactly what. Rotation leaves CURSOR, LOCATION and PRELAUNCH HMACs and the adopter session alone: they use separate secrets. **Magic links sent in the last 15 minutes stay valid across rotation**, because they are stored as an unkeyed SHA-256, and they mint new-secret sessions. Add that one sentence.
4. [info] KH-T4 says it was measured on "Node 24", but the pasted check ran on Node 22.22.3. Say which.

SIMPLIFICATIONS
- auth.ts hooks.before: the second `ctx.request !== undefined` repeats what `limited` already implies. Compute the IP key once (`const ip = ctx.request && clientIp(ctx.request)`). Nothing breaks.

STOP REASON
These block the merge, not the commit. Both are defaults the builder chose, in areas on the STOP list (item 5). Both are recorded as "reviewer to check" and neither has Oleksii's answer:
1. **KH-T6**: production refuses to boot without `CRON_SECRET` of 32+ characters. This is env validation that can take production down. Oleksii must set the secret before deploying, and must say yes to boot-time refusal rather than the route refusing on its own. Recommend yes.
2. **KH-T5**: `/api/cron/auth-cleanup` skips the pre-launch gate. The exemption is exact, the route checks the secret, and it fails closed. Recommend yes.
KH-T7 is inside his verbatim answer ("existing kabinet limiters"), so it needs nothing.

TESTS
apps/web (9 touched files): 299 passed. packages/db auth-expiry-repo: 4 passed; neon-smoke (local): 10 passed. Builder's full check: workspace 2007 passed; harness 219 passed, 3 skipped.
