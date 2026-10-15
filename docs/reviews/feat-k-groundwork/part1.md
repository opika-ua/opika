# Review: feat/k-groundwork, part 1 (uncommitted diff over 7524ed1), Tier 1 synchronous

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| 9 touched suites green: 232/232 (apps/web scope) | Full `pnpm check` (2586 unit / 226 harness): not committed yet, so no pasted run to read |
| Origin check removed → 6/7 rpc-origin cases red ("a refused call must never resolve a session"); same-origin case stays green | Browsers we support send Origin on a same-origin fetch POST (Fetch spec says so; nothing in the harness exercises it) |
| Swipe shelter guard alone disabled → only the non-verified case red ("expected HTTP 404 for NOT_FOUND, got 200"); discoverable guard alone removed → only the draft case red. Each guard is pinned on its own | oRPC refusing GET (the comment's premise) |
| `home.ts` calls the router in-process (`createRouterClient`), so the check doesn't touch it. The harness never calls `/api/kabinet` over HTTP. The only browser caller is `SupportBanner`'s exitSupport fetch, which is same-origin | K-T2's "Vercel body limit is now 100 MB": no source cited |
| Bypass: `Headers.get` ignores case; `new URL(baseURL).origin` drops a trailing slash or path and the default port; browsers send lowercase origins with no path; IPv6 `[::1]` comes out the same both ways; a duplicated header joins to "a, b" and is refused | |
| reveal.ts already refuses non-discoverable animals and non-verified shelters (K-T1's premise) | |

FINDINGS (most severe first)
1. [medium] docs/decisions-inbox/feat-k-groundwork.md K-T3: records "judged acceptable" for something Oleksii asked to be *told* about ("If the standing rules make this a bigger risk than it looks, tell me"). Present it as a question with its consequences, not a settled judgement. It leaves out three things PR 2 will hit: (a) if the allowlisted id lives in an env var, that is env validation, STOP item 5; (b) commitment #6's register text ("stay true while shelter writes are refused") and `no-self-serve-yet.test.ts` become conditional on the allowlist and must be updated in the same change; (c) if the allowlist ever reaches the database or the env schema, "widens no public schema" stops being true. Not a STOP for this diff, because the diff ships no allowlist code.
2. [low] docs/decisions-inbox/feat-k-groundwork.md K-T2: states a platform limit that contradicts Oleksii's figure, with no source. Either link the Vercel docs page or mark it unverified. (Memory note: the project is on Hobby, not Pro.)
3. [low] apps/web/src/kabinet/handlers.test.ts, requestReview test: the title says "keeping its evidence", but nothing asserts the evidence. Assert `verification.evidence` (or the stored row's) equals `evidence`, or drop the clause from the title.
4. [low] K-T1: "a draft with activity was published" holds only for swipes recorded after PR 1. A swipe on a draft written before this change through the open API would break it. Production holds test data only, so this is worth one sentence in K-T1, not a fix.
5. [note] Development: opening the app on `127.0.0.1` while `BETTER_AUTH_URL` is `localhost` (or reaching it via www vs apex) now gets a 403. That matches the confirm page's existing behaviour. Ordering is right: the 403 comes after the per-IP limit and the availability 503 (both public facts) and before the registry 503 and `resolve()`.

Swipes on an animal adopted in between are dropped silently (`safe()` in use-feed-deck.ts). That is acceptable: the animal is never served again, so it has no seen-set entry to lose.

SIMPLIFICATIONS
- None worth proposing in this diff.

TESTS
apps/web, touched files only: Test Files 9 passed (9); Tests 232 passed (232).
