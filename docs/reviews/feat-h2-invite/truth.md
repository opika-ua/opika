# Review: uncommitted work on feat/h2-invite (HEAD 607a31d): city-only pre-reveal, HMAC IP keys, 30-day clean-up

VERDICT: STOP (blocks the merge, not the commit; commit this and push it)

VERIFIED | TAKEN ON TRUST
--- | ---
`pnpm check` is green for the workspace: I read the pasted output (2382 unit tests, harness 222 passed / 3 skipped) | That `pnpm check` run itself. I did not rerun it, by instruction
The touched tests pass: contracts 251/251, i18n copy-status 44/44, db auth-expiry 8/8, apps/web 11 files 191/191 (including handlers-implement-contract) | Rendered RSC/HTML payload of /tvaryny, /tvaryny/[id] and /gortaty. I did not render them. By the code path: every page reads only through `anonymousRouterClient` (`createRouterClient(router)`), the handlers project with `cityOnlyLocationOf`, and no sitemap exists. Inferred, not observed
`tsc --noEmit --incremental false` is clean for domain, contracts, db, i18n and apps/web | neon-smoke step 18 against real Neon (not run; still unticked in h2-next-prs, correctly)
Mutation 1: `district` picked into `PublicCityLocationViewSchema`. Contract walk goes red 4/4 (`$.publicLocation.district`, "…needs an explicit decision"). The served-JSON test goes red too | Oleksii's EM-B5 wording. The inbox marks it relayed and not seen first-hand
Mutation 2: proxy.ts goes back to `check(clientIp(request))`. Red: "limiter key carries the IP (203.0.113.77)" plus the scan ("proxy.ts: a limiter charged on a bare address") | Upstash keys: I read the 2.2.0 source (`PEXPIRE window*2+1000`, so about 2 h for `address:<email>`). I did not observe this live
Mutation 3: the cap condition `lt` changed to `lte`. Boundary test red ("expected [s-under-cap, s-young] to include 's-at-cap'"). All three files restored, sha1 checked |
Every `.check(` call site with an IP goes through `ipRateLimitKey`. `analytics` is not enabled. No log line contains an IP |
`ContactRevealDialog` renders the name, the channels and «м. {city} · …», and does not render `exactAddress` |

FINDINGS (most severe first)
1. [STOP-5] `apps/web/src/api/rate-limit-key.ts:41-52`. Outside production, when no secret is set, the builder took a default: one random key per process. Oleksii specified production only. This is HMAC-key and env-validation policy, so it is not ours to default. Consequence on a Preview deployment: buckets are per instance, and the proxy and the route handlers hash with different keys. So the bootstrap per-IP limit, which CLAUDE.md says MUST exist, is multiplied there. A configured secret under 32 characters is also accepted silently outside production. The choice is sound for local dev and tests. It is unsound for Preview if a Preview reaches a shared database.
2. [medium] Row 57 is not pinned for the time after a reveal. The served test proves the reveal JSON contains `exactAddress`, `district` and the point (decision #2). No test asserts that the reveal dialog does not render `exactAddress.line1`. Decision #2 permits rendering it, and doing so would make «не бачать точної адреси» false with nothing going red.
3. [low] `CLAUDE.md:309` ("Never construct a PublicLocation by hand") still says "centroid is available via `CityView.centroid`". That is false now. Oleksii's edit.
4. [low] `cities.list` no longer sends `centroid`. This follows from his words ("no coordinates"), and EM-T19 records it honestly as reversible. Fine.

SIMPLIFICATIONS
- `build-env.ts:21`: `PRODUCTION_SECRET_MIN_LENGTH` is an alias of `CRON_SECRET_MIN_LENGTH`. Keep one of the two names. If this is wrong, nothing breaks except imports of the removed name.

STOP REASON
Oleksii, in ranked order:
1. RATE_LIMIT_KEY_SECRET outside production. Choose one: (a) keep the random key per process (the default taken); (b) require it on any Vercel deployment (`VERCEL` set), which includes Preview; (c) require it everywhere and give tests an explicit value.
2. Acknowledge row 57's precise scope. It is true of every screen before and after a reveal. After a reveal it is not true of the data the adopter receives. His EM-B5 says "exact address after a reveal stays". Also say whether that half should be pinned by a test (finding 2).
3. Add the one-line correction to CLAUDE.md's PublicLocation bullet.

Precise answers to the brief:
- «Адреси, введені у формі входу… видаляються протягом двох діб»: true. `auth_verification` rows go at the cron, at most about 25 h 15 min later. The Redis `address:<email>` keys (plain text) expire after about 2 h of window plus 1 s.
- /pro on IPs: the only IP claim is «IP-адреси не зберігаються». It is true of Postgres and of the limiter store, which holds an HMAC. It is pseudonymous: whoever holds the secret can enumerate IPv4 addresses. That is his chosen design.
- /pro's existing sentence «…бачить лише наближену локацію» remains true, because the city is an approximate location.

TESTS
- contracts: 251 passed
- i18n (copy-status): 44 passed
- db (auth-expiry): 8 passed
- apps/web (11 touched files): 191 passed
- Workspace total, from the builder's run: 2382
