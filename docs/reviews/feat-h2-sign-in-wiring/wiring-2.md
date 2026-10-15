# Review: feat/h2-sign-in-wiring, pass 2 (delta, uncommitted, on 8a5a0b9), Tier 1

VERDICT: STOP (blocks the merge only; commit and push are fine). The code is sound. Two decisions belong to Oleksii and were made by agents: one by the coordinator, one by the builder.

VERIFIED | TAKEN ON TRUST
---|---
Touched suites, run myself: web build-env/env/auth/production-sign-in/production-wiring 5 files 205/205; i18n copy-status 45/45. `tsc --noEmit --incremental false` clean for apps/web and packages/i18n | Full `pnpm check` (2531 / harness 226). The commit message gives the scoped counts; the log tail shows harness 226. Not re-run
WI-Q3 (i), the code path: the confirm POST is limited only by `hooks.before` → `perIp`. The per-user check needs a session cookie and `forwardedClientHeaders` strips it (test). The proxy skips the POST (`isChargedKabinetPageLoad`) and the adopter limiter only covers discovery paths | The «Вийти» harness spec going red when sign-out is a no-op (the builder's mutation; I did not run the harness)
WI-Q3 (i), Upstash: I read `@upstash/ratelimit` 2.2.0 `dist/index.js` (the single-region `slidingWindow` and its Lua, and `Cache.isBlocked`) myself and **agree**. A request is refused when `floor((1−f)·prev) + cur ≥ 300`, and a refusal returns before `INCRBY`. The cache blocks while `reset ≥ now`, where reset = start(N+1). After a burst of 300 at the end of bucket N, the boundary millisecond is refused (floor(300)=300). At +1 ms the estimate is floor(299.995)=299, so the request is allowed. `cur_N ≤ 300` holds by construction, so the bound is refused at t ⇒ allowed by t + 60 s + 1 ms. It cannot exceed a minute while the IP sends nothing else. «хвилину» stands | Vercel's stored values have no padding (cannot be known without reading them, which I did not do)
WI-Q3 (ii): the new test proves it by behaviour. Same visitor, same link, refused at +30 s and +59.999 s, then 303 plus a session at +60 s | The other 10 recorded mutations: each names a concrete break and failure text, so they read as actually run
Copy: uk.ts is byte-equal to the quoted text in the inbox (script; U+2014, U+201E, U+201C). Reading the outer «» as quoting is correct ("„“ inside «»"). Pinned as literals in copy-status FINAL and in the auth.test card | 
Sign-in flips on merge: live catalogue pending = [] and the reported config gives `on`. Nothing else in the copy gate. Row 2 watch item: `animalsDeleteDraft:401` `has_activity`, confirmed | 
Mutation spot-check: made `inMemoryRateLimiter` count refused calls → "60 s later" red, `expected 429 to be 303` at auth.test.ts:1014. Restored; diff unchanged | 

FINDINGS (most severe first)
1. [STOP] docs/decisions-inbox/feat-h2-sign-in-wiring.md WI-T5: the Neon pre-merge item (h2-next-prs:366) names "a fresh child branch". Oleksii himself flagged that the run used smoke-invite instead. "It counts" is the **coordinator's** ruling, and an agent's ruling is a recommendation, not approval. I agree with its reasoning (0011 is still the newest migration and #99 adds none), but he has to say so. The checkbox is still unticked.
2. [STOP, env validation] WI-T10: "refuse padding, never trim" is the builder's reading of "share one rule", but its status says "built (his rule)". It should say "default taken". It is a sound choice: runtime reads the values raw. Deploy consequence: if any Production value carries a trailing newline (`echo x | vercel env add` stores one), the merge build fails, naming the variable. The previous deployment stays live, but sign-in does not go on until he re-sets the value.
3. [low] auth/proxy: in an Upstash outage or a >1 s timeout, the limiter fails closed (RL-1). The confirm POST then shows the same card, and «зачекайте хвилину» may not hold. «Посилання ще дійсне» still does. This needs the store to fail between the GET and the POST. Tell him; no change needed.
4. [low] At a bucket boundary, the `/kabinet` load right after a successful verify can get a bare 429 for about 200 ms (the token is already spent and the session is set; a reload works). Not covered by the copy.

NEXT_PUBLIC_R2 out of zod: no regression. Blank still fails at boot, and padded now fails too. Harness ordering (workers 1, retries 0, test placed last, documented) is acceptable. Row 6, brand-voice and the commit message are accurate as of merge.

SIMPLIFICATIONS
- None.

STOP REASON
Before merge, two one-line answers from Oleksii: (1) does the smoke-invite run satisfy the "fresh child branch" item? (2) refuse or trim padded values? Refuse is recommended. Then tick h2-next-prs:366 and change WI-T10's status.

TESTS
web (5 touched files): 205 passed. i18n copy-status: 45 passed. Mutation: 1 failed / 45 skipped (auth.test, filtered).
