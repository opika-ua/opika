# Re-review: feat/k-groundwork, PR 1 part 2, fixes for findings 1-6 (uncommitted, on 4354e82), Tier 1

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Smoke steps 22 (draft INSERT-in-CTE, 1 `animal_created` line) and 23 (recorded publish writes 1 line; the stale repeat conflicts and writes none) exist and pass locally (`neon-smoke.test.ts` counts 23 outcomes) | **neon-http: steps 19-23 never ran on Neon.** PR 1's ledger must list them as *asserted* |
| `$&` sweep: grepped every `.replace`/`.replaceAll("{…` in apps/web and packages. The 12 user-valued sites use function replacers and have `$&` tests that assert transcribed literals. The left-alone sites substitute only digits, `Intl` output, the cookie's hex token, constant labels, or `countdown()` (digits and a colon) | Full `pnpm check`: not run yet, and nothing is committed, so there is no commit body to read |
| Mutation: eager `new Intl.Segmenter` at module scope → "loads, and counts code points instead of throwing" fails with "TypeError: Intl.Segmenter is not a constructor" | |
| Mutation: `editedAge` reverted to always restamp → "re-sending the declared age bucket…" fails ("expected 1 to be +0") | |
| Mutation: whole `input.event` stored in history → the six-moves test and the K-Q18 test fail ("not to contain 'Забрала пані Олена'") | |
| No-op save: version, `lastUpdatedAt` and history are untouched (handlers test). `LocalizedText.en` is nullable, never absent, so the deep compare can't flag a phantom description change | |
| The 1,500-character cap exists once, in domain. Onboarding tests 1,500, 1,501 and 🐾×1,500. K-Q18 quotes his K-B1 K-Q7 words verbatim, status open, default "code only" | |

## Findings

1. **[medium] `apps/web/src/kabinet/handlers/animals.ts` `editedAge` compares against the *stored* bucket. It should compare against the bucket as of `now`.** A declared bucket rolls forward (`ageBucketOf`).
   Failure scenario: stored `young`, declared 2024-01-01, now reads `adult`. The shelter corrects it to «young». Because input === stored bucket, the old anchor is kept and the card still says adult. The save returns 200, no history line is written, and the correction is silently dropped.
   Evidence: probe `ageBucketOf({young, 2024-01-01}, 2026-10-17)` → `"adult"`.
   Fix: keep the anchor only when `input.bucket === ageBucketOf(current, now)`, and otherwise restamp. This is the rule `age.ts`'s own note above `isAgeEstimateUncertain` asks for. Add a test where the stored bucket is stale.
   It is still within HS-T8, because the server stamps and a client date never lands. Only the comparison is wrong. Unreachable until K3, since writes are still refused.
2. **[low] Mutation lines are missing.** This is Tier 1, so I ran the mutations above myself. The commit body should still carry `mutation:` lines for the new guards (lazy Segmenter, `editedAge`, `listingHistoryEventOf`, the onboarding caps, the `$&` sites).

Nothing else broke. No STOP item, and no new Ukrainian copy.

## Simplifications

- The previous pass's value-or-function `tap` suggestion was taken. `OnboardFreshnessSentenceUkSchema` and `freshnessSentenceText` still duplicate the same switch. That is optional, as noted before.

## Tests

Scoped runs only, all green after the mutations were restored: domain shelters 251 passed (11 files) · contracts 311 passed (6) · db onboard-shelter + kabinet-animal-repo + neon-smoke 50 passed (3) · web handlers/registry/invitation-reminder/implement-contract plus 9 component files 269 passed (13).
