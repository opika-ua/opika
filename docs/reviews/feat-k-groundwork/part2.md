# Review: feat/k-groundwork, PR 1 part 2 (uncommitted diff on 4354e82), Tier 1

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Domain shelters 246/246, contracts 311/311, db kabinet-animal-repo + onboard-shelter 38/38, web handlers/registry/SwipeCard/AnimalDetailScreen/ShelterProfile/handlers-implement-contract 206/206 (all green, run here) | Full `pnpm check` (2735 unit, 226 harness): caller's figures, no commit body yet |
| Mutation: `fillAnimalName` with a string replacer → "Expected: Чи Пес $& $1 $$ тут? Received: Чи Пес {імʼя} $1 $ тут?" | neon-http behaviour of every CTE write: NOT run on Neon |
| Mutation: name brace check removed → 6 domain + 5 contracts tests red (incl. "refuses a patch whose name carries the token") | Reveals refusing a non-discoverable animal (K-T1, part 1) |
| Mutation: listing move always takes the unrecorded path → repo "a recorded move writes its line…" + handler "each of the six moves records…" red | Builder mutations: none recorded in K-T5/K-T6/K-T7, so I ran the three above myself |
| Mutation: referenced refusal given a different message → "refuses a once-public draft and a referenced draft with the same answer" red (the test commitment #2 cites) | |
| Grapheme counting: ZWJ, flag, skin tone, combining accent, 280/281 with 🐾 are all tested | |
| `new Intl.Segmenter` runs at the top level of a shipped client chunk (`.next/static/chunks/2v0a9j_lj1psh.js`) | |

## Findings (most severe first)

1. **[medium] Not verified on neon-http.** `packages/db/test/neon-smoke.ts` covers the edit CTE (19) and the delete CTE with its 23503 (21). It never covers the INSERT-in-CTE (`insert`, `animal_created`) or a *recorded* listing move: step 20 passes `not_recorded`. Before calling this verified: add smoke steps for both, then run the smoke (19, 20, 21 and the new ones) on a Neon target. Choosing that target is Oleksii's call, since the script refuses production. Until then, PR 1's ledger lists this as asserted.
2. **[medium, sweep, existing code] Same defect class as `fillAnimalName`.** `apps/web/src/features/gallery/AnimalCard.tsx:235` and `features/reveal/ContactRevealDialog.tsx:328` use `.replace("{name}", name)`. Evidence: `node`: `"Притулок каже: {name} уже".replace("{name}","Пес $& $\`")` → `Притулок каже: Пес {name} Притулок каже:  уже`. Names become shelter-typed in K2, and the name rule still allows `$`. Fix: use a function replacer and add a test with `$&`.
3. **[low] `freshness-sentence.ts:21`.** The top-level `new Intl.Segmenter` runs whenever a client bundle loads `@opika/domain` (now SwipeCard as well). A browser without Segmenter (Firefox < 125) throws while loading the module, which breaks hydration for the deck and the page. Fix: create the segmenter lazily inside `characterCount`.
4. **[low] K-T6(2).** `fields` lists the patch keys that were sent. If K3's form sends the whole patch, every edit line will tell the shelter that all 8 fields changed. K3 must send only dirty fields, or the server must diff. Record which one in K3's row.
5. **[low] K-T6(4).** The shelter's free-text withdrawal `note` is copied into the append-only history. A note like «забрала пані Олена» puts an adopter's name somewhere it can't be erased. Add an inbox row so Oleksii can say whether K-Q7's "never adopter data" means code only.
6. **[low] K-T5(7).** The onboarding script doesn't cap descriptions. An onboarded description longer than 1,500 characters can't be saved in K3 until the shelter cuts it. Apply the same cap there.

No STOP item. No new Ukrainian copy. The docs are accurate: commitment #2's register text and E3 match the code, and the cited test exists and goes red. K-T5, K-T6 and K-T7 stay within K-Q6, K-Q7, K-Q9 and K-B2. Output stripping is unaffected, because the transforms are on inputs only.

## Simplifications

- `onboard-shelter.ts` `OnboardFreshnessSentenceUkSchema` and `procedures.ts` `freshnessSentenceText` are the same switch and differ only in what they do with `empty`. Export one domain schema with output `string | null` and refine away the null in onboarding. If that's wrong, onboarding accepts a blank sentence, which `onboard-shelter.test.ts` catches.
- `animals.ts` `CONFIRMATION_NOT_RECORDED`: a function that only returns a constant. Make it a `const` and let `tap` take either a value or a function. Low value, optional.

## Tests

domain (shelters) 246 passed · contracts 311 passed · db (2 files) 38 passed · web (6 files) 206 passed. Scoped runs only, all green after the mutations were restored.
