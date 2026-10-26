# Review: kabinet copy 2 (uncommitted on 8c26ec4, feat/h2-invite, PR #94) - Tier 1, synchronous

VERDICT: STOP (merge only; the commit may land, per the 2026-09-06 amendment)

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Rows 79, 10, 85 in `uk.ts` are byte-identical to the strings quoted in EM-B4 (compared by script against the inbox row). Row 82 is HEAD's text + `\n- {operator}`, and the dash is U+2014, the same as the invite's and the inbox's | That EM-B4 is a faithful copy of Oleksii's message. It was relayed, so I could only compare against the inbox |
| The /pro addition is HEAD's `about.data` + " " + the h2-copy-sheet KH-C1 block, byte-exact (script) | The KH-C1 sheet text matching his row-90 "FINAL YES as drafted" |
| `magicLinkEmail` fills `{operator}`; HTML `<br>- name</p>` and text signature are tested. Its only caller outside tests is `email-delivery-test.ts`. `providerMagicLinkSender` has no production caller yet (wiring commit), and the option is required (tsc clean) | Better Auth `hooks.before` firing on direct `auth.api.getSession` calls, which is what bounds the over-cap session case |
| `ProductionSignIn.on.operatorName = operatorDisplayName(env)`. Mutation `operatorDisplayName({})` → 1 failed, "Expected: Олексій Колотенко / Received: Оператор реєстру". Restored from a backup copy | The other 5 recorded mutations (they do describe real breaks) |
| Upstash keys: `@upstash/ratelimit` 2.2.0 slidingWindow `PEXPIRE window*2+1000`, key `prefix:<id>:<window#>`, analytics off. kabinet-ip `ip:<addr>` ~121 s; kabinet-sign-in-ip `ip:<addr>` and `address:<email>` ~7201 s | Vercel request logs |
| Row 57: `PublicLocationSchema` carries `district` + `FuzzedCoordinates`; `ShelterContactSnapshotSchema` carries `exactAddress` in the reveal response | The builder's list of rendered surfaces (I did not re-walk every adopter component) |
| `auth_session` stores only id/token/timestamps/`user_agent`/user_id/active_org (+ `ip_address` disabled) | |

## FINDINGS (most severe first)

1. **[STOP] `uk.ts` about.data - «IP-адреси не зберігаються.» is false in a wider way than EM-Q11 records.** The adopter limiter `apiRateLimiter` also keys Upstash on the raw IP, with no prefix: `opika-api-ratelimit-<env>:<ip>:<n>`, kept ~121 s. It is charged on every discovery page (`proxy.ts:87`) and every `/api/rpc` call (`route.ts:19`). /pro is an adopter-facing page, and this sentence stands alone. So a visitor who reads it as covering the whole site is wrong too, not only the kabinet. EM-Q11(1)'s "hash the IP" option would have to cover `apiRateLimiter` as well. Evidence: grep plus reading `rate-limit.ts` and the library's Lua.
2. **[STOP] EM-Q11(2) confirmed.** The cap hits at createdAt+30 d. The last sliding refresh can happen just before that, so `expires_at` can be up to 7 d later. Add the strict `expires_at < now` and the next Hobby run (≤ ~25 h): worst case **≈ 8 d 1 h** after the session loses force, ≈ 9 d with one skipped run. The other kinds of record fall within two days.
3. **[STOP, agree with the builder] Row 57 / EM-Q10.** On screen, adopters see the city and nothing finer. But «не бачать точної адреси — лише місто» is false in the sense a shelter cares about. Before a reveal, the browser receives the district and a 1 km point. After a reveal, it receives the **exact address** (decision #2, by design, up to 30 shelters/24 h per device). Keeping the caption deleted is correct.
4. **[minor] Doc mismatch:** EM-Q9 says the /pro item in `h2-next-prs.md` is "ticked", but it is unticked (which is correct while EM-Q11 is open). Fix EM-Q9's wording.
5. **[note] The merge block is only a checkbox.** The pins assert that the disputed text is present, so nothing goes red on merge. Keep #94 in draft until EM-Q11 is answered.

## SIMPLIFICATIONS
- `production-sign-in.ts` `operatorName` on the `on` variant has no consumer until the wiring commit. That is acceptable as the hand-off point. If you drop it, the wiring commit has to call `operatorDisplayName(env)` itself, and the guarantee that both emails get the same name rests on that commit getting it right.

## STOP REASON
Oleksii needs to decide three things, ranked:
- (a) the IP sentence: narrow it to the database, or hash IPs in **all** limiters, adopter and kabinet;
- (b) the 30-day-cap sessions: accept ~8 d, have the clean-up also delete sessions past the cap, or reword;
- (c) row 57: reword it to the pages, or narrow what the API sends.

## TESTS
apps/web touched files: 8 files, 115 passed. packages/i18n: 4 files, 55 passed. `tsc --noEmit --incremental false` clean on apps/web and packages/i18n. Builder's full run (from the message): 2338 unit, harness 222 passed / 3 skipped.
