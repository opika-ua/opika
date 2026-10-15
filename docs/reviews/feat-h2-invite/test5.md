# Review: delivery test 5 flag, test 4 record, SPF fix, Brevo retirement plan (uncommitted on 68dcd2f)

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
---|---
`email-delivery-test.test.ts` run: 28/28 pass | Builder's full `pnpm check` (2422 unit, harness 222/3 skipped), from the commit message draft
Both-on-Resend builds routes like production: `EMAIL_PROVIDER=routing.invite`, default key = Resend key; `emailRoutesOf` then treats sign-in=resend as the default route (read `email-provider.ts:186-213`) | EM-B9's full text is Oleksii's word for word (the prompt's excerpt was elided; every fragment it gives matches the row exactly)
invite=resend + sign-in=brevo can't be expressed in production: `PROVIDER_KEY_NAMES` has only `resend`, so `emailRoutesOf` returns `invalid`. The refusal is sound, and in the script it runs before any key is read | That the `token=...` ellipsis is his
`deliveryKeysOf`: tests check key reads by name and count for all three valid routings. The script reads keys only through it | The script itself (`scripts/email-delivery-test.ts`), read but not run (not allowed)
The Resend invite body test checks the exact key set and the absence of headers/tags/topic_id/List-Unsubscribe in the serialised request | Builder's other four mutations (each names the broken thing and quotes failure text; that looks like a real record)
Output is only provider/status/id, and a test checks the key never appears in it. No address or key in the diff (grep) |
My mutation: default-route key → `input.apiKey ?? "wrong"`. Result: `expected 'Bearer wrong' to be 'Bearer re_test-key-not-real-9876543210'`, 1 red. File restored, byte-identical (`cmp`) |
SPF fixed everywhere outside docs/reviews: EM-R3 and `h2-next-prs.md` (both the test 4 and test 5 items); no other tracked doc states send.mail as the SPF host (grep) |
EM-P1 names exist: `providerRequest`, `brevoBlockedContactsRequest`, `scanBrevoBlockList`, `BLOCKED_*`, `blockedStatusOf`/`cachedBlockList` Brevo branches, `admins.blockedAddresses`, contract `why` enum lacking `provider_suppresses` |

FINDINGS (most severe first)
1. [medium] docs/decisions-inbox/feat-h2-invite-email.md EM-P1 step 1: "Invites move by config: `EMAIL_PROVIDER=resend`" leaves out that the default route's key is `EMAIL_PROVIDER_API_KEY`, which holds the Brevo key today.
   Failure scenario: follow step 1 as written → every invite goes to api.resend.com with a Brevo key → 401 → no invites sent. The step must also set `EMAIL_PROVIDER_API_KEY` to the Resend key, or do step 2's change (default route reads `RESEND_API_KEY`) before the flip. The delivery test already does the first of these (that is how it builds the route), but the plan doesn't say so.
2. [low] EM-P1 step 3's precheck "no `brevo` provider on any send log line" describes a log that doesn't exist. Send logs (`email-senders.ts:130,138`) carry no provider, and a sent, checked email logs nothing. The Brevo dashboard check is the only real evidence. Either reword it, or plan a provider field as part of step 1.
3. [low] EM-P1 grace reasoning: "late bounces ... verify against Brevo's DKIM keys". Retries signed by Brevo do get DKIM-checked when they finally arrive. Bounces don't: they are DSNs sent back to Brevo's return path. 30 days is still ample, and the retry reason alone carries it.

The rest is accurate. Nothing is removed, and the plan is gated on test 5 in his words. Verbatim and paraphrase are kept apart in EM-B9 (the message ids are marked as the relay's, not his).

SIMPLIFICATIONS
- email-delivery-test.ts runDeliveryTest's `unroutableDeliveryOf` check repeats what `emailRoutesOf` already returns as `invalid`. The check the script runs before reading keys is the one with a purpose. If the inner check goes, the only loss is the specific error text, and the refusal test would need to assert the `emailRoutesOf` reason instead. Optional.

TESTS
apps/web email-delivery-test.test.ts: 28 passed (28). Full suite not run (builder's green run is the evidence).
