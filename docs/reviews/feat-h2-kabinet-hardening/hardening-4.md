# Review: feat/h2-kabinet-hardening, uncommitted delta on 8db53e7 (pass 4, Tier 1, delta only)

VERDICT: STOP. This blocks the merge only; committing is fine. The code delta is sound. Two decisions are still open. The first is carried over: the runbook's `DELETE FROM auth_verification;` has no answer in the inbox. The second is new: the inbox now holds two different KH-F1 SQL texts for the production branch.

VERIFIED | TAKEN ON TRUST
--- | ---
Touched suites, Node 24.21.0: build-env, proxy, env (apps/web): 86 passed. neon-smoke.test (db): 10 passed | The builder's full `pnpm check` (2053 unit, harness 219 passed / 3 skipped), pasted in the message
Real `next build` with `VERCEL_ENV=production`, a dummy R2 URL and `CRON_SECRET=` fails at config load with the CRON_SECRET message, raised from `build-env.ts:49` | That Vercel exposes `CRON_SECRET` to the build step (the PR body lists this as asserted, which is correct)
R2 check: same condition and the same message text when R2 is the only problem. Local and CI builds set neither `VERCEL` nor `VERCEL_ENV`, so they are unaffected. One thing changed: a Vercel production build missing both variables now names both, on two lines | The builder's other mutations (floor 31, any-Vercel, lower-casing, decodeURIComponent, trailing slash, the walk mutations). Each describes a real break
Spot-check of the builder's `startsWith("/api/cron/auth-cleanup")` mutation: 8 failed, as recorded |
My own mutations. Second pass ignores the IIFE hints: 2 failed. `void (async () => { await import("@/kabinet/runtime"); })();` appended to proxy.ts: 2 failed (runtime.ts in the walk, plus 11 heavy entries). A legitimate lazy `export async function f() { return import("@/kabinet/runtime"); }`: 20 passed, so no false red. Both files are restored (sha1 matches) |
Query string: `pathname` excludes the search part, and the route authenticates by bearer, so `?x=1` passing is harmless and intended |
Comments: no "within a day" is left in code or docs. Two days matches a daily Hobby cron. The KH-C1 timing arithmetic (about 25 h worst case, about 50 h if one run is missed) checks out |
Diff scanned for URLs, long hex and `npg_`: nothing found |

FINDINGS (most severe first)
1. [high] `docs/decisions-inbox/feat-h2-kabinet-hardening.md`: KH-F1 appears twice and the two versions contradict each other. Row 27 is the coordinator's version. It has `default_transaction_read_only`, `GRANT CONNECT`, `ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner` and a four-check verification. The "KH-F1 runbook step" section below the table is the builder's reconstruction. It drops all three and argues against ADP ("so it isn't in the text"). Oleksii will run one of them against production.
   Failure scenario: he runs the section's version, and the next migration's table is unreadable. Or he runs the row's version, and a future sensitive table becomes readable automatically, which the section warned about.
   Fix: keep one text (the row, since it comes from the actual proposal) and delete the section. Move the section's useful parts into the row, as finding 2 describes. The commit message and PR draft describe the section ("reconstructed… to be checked"), so update both.
2. [medium] Row 27's verification can only show `false`. A role whose `GRANT SELECT ON ALL TABLES` never ran passes all four checks. Add positive checks that must come back true: `shelters` SELECT and `drizzle.__drizzle_migrations` SELECT. Also add the section's `pg_roles` attribute check.
3. [low] `.env.example:85-86` and KH-T6's "Default taken" column still say only "production stops booting". A production *build* now fails first. `env.ts` was updated; these two were not.
4. [info] `resolveLocal` throws on a relative non-TS specifier (`.json`, `.css`, `.mts`). That fails loud, which is the safe direction. No action.

SIMPLIFICATIONS
- None.

STOP REASON (merge only)
1. Carried from pass 3, unanswered in the inbox: approve the runbook's `DELETE FROM auth_verification;` on production (`docs/onboarding-a-shelter.md:302`).
2. KH-F1: Oleksii confirms which SQL he runs. In particular, did the proposal he approved include `ALTER DEFAULT PRIVILEGES`? His verbatim answer does not mention it. The row says it was in the proposal; the section says it wasn't. Only he can say.

This is the fourth pass on the row. Findings 3 and 4 become PR comments.

TESTS
apps/web: 3 files, 86 passed. packages/db neon-smoke.test: 1 file, 10 passed. Mutations: no IIFE hints gives 2 failed. Aliased IIFE in proxy.ts gives 2 failed. Lazy aliased import gives 0 failed (correct). Prefix gate gives 8 failed.
