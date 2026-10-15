# Delta review: uncommitted fixes for 5f9e7c4.md, feat/h2-invite (HEAD 7953a3d). Tier 1, synchronous

VERDICT: PASS WITH NOTES

| VERIFIED (ran / read output) | TAKEN ON TRUST |
|---|---|
| Touched suites green: apps/web email-message, email-provider, email-senders, registry, handlers-implement-contract: 5 files, 143 tests. contracts kabinet/contract.test: 165. i18n: 4 files, 22 | The full `pnpm check` (1864 unit, harness 217): read from the message file, not re-run (port 3100) |
| F1: `sendChecked` returns `clear` only for `not_blocked`. All four `unknown` whys, plus a throwing lookup, give `sent`/`unknown`. The 501-contact case runs end to end through the real `blockedStatusOf`. A bare `sent` fails to parse. registry.test asserts that `unknown` reaches the operator through the served procedure (handlers-implement-contract covers it). The `BlockedStatus` and views.ts comments now match the behaviour | Five of the builder's six mutations. All six are present, and each names a concrete break and its failure text |
| F1 additions: the masked log line is pinned by exact array equality, `o•••@example.org`, with no link or token. `consoleInvitationSender` reports `unknown` | Oleksii's texts in IN-E6 and IN-E13..E15: relayed, and labelled "relayed by the coordinating session, not seen directly" |
| F2: one AbortController per lookup, cleared in `finally`, so nothing leaks. My spot-check of the builder's mutation set the deadline to 60_000: 2 tests went red, "expected 'pending' to deeply equal { kind: 'unknown', why: 'timed_out' }". Restored, and the file is byte-identical to the backup | |
| F3: the guard now matches anywhere in the label. «Перейти на opika.org.ua» and Cyrillic TLDs are refused. Negatives cover ordinary punctuation. The over-refusal (`Node.js`, `м.Київ`) is documented on the function | |
| F4: the IN-E12 row binds the rendered-outcome test to the screens PR, including `sent`/`unknown`. The simplification is applied: the re-export is gone and email-delivery-test.ts still imports what it uses | |
| IN-E13 is not built: grep finds `tellPersonally`/`inviteSent` in no `.ts`/`.tsx`. Section R is marked "planned, not built, not in uk.ts" and the draft is on the copy sheet only | |

## FINDINGS

1. **[low] email-provider.ts:355-366: "a page already received is still used" is claimed in the message but pinned by no test, and only partly true.**
   *My mutation:* I inserted `if (deadline.aborted) return timedOut;` right after the body read, which discards every late page. All 35 provider and sender tests stayed green. Restored.
   Separately, if the deadline fires while `response.json()` is still streaming, the shared signal aborts the body. `.catch(() => null)` then turns that into `provider_error` rather than `timed_out`, so the page is not used. Both answers are `unknown`, so the operator sees the same `blockCheck`, but the `why` is mislabelled. Either drop the claim, or add a fake-timer test where headers arrive before the deadline and the body after it, and decide which `why` that case should get.

## SIMPLIFICATIONS

None new.

## TESTS

apps/web (5 files): 143 passed. contracts contract.test: 165 passed. i18n (4 files): 22 passed. These are scoped counts, not the workspace total.
