# Review: fix/copy-no-reyestr (uncommitted diff, Tier 1, pre-commit)

VERDICT: PASS WITH NOTES

| VERIFIED | TAKEN ON TRUST |
|---|---|
| Codepoint comparison of the three uk strings against the CB-B1 quote in the inbox file. Item 2 is an exact match. Items 1 and 3 end in his text, and their prefixes are unchanged from origin/main (word-diff). Dashes are U+2014; `імʼя` is U+02BC twice, with no `'` or `’` variants | That the inbox quote is Oleksii's message verbatim (no independent record in the repo) |
| Word-diff of uk.ts and en.ts: only the three keys changed, plus two JSDoc comments | Full `pnpm check` (unit 3280, harness 230): no commit yet, so nothing is pasted |
| `{імʼя}` stays literal: `VoiceSection.tsx:158` renders `{t.voice.hint}` with no fill. Mutating it to fill the token turned `ProfileEditor.test.tsx:435` red | `animal-detail.harness.ts`: not run, because Docker did not respond |
| Mutation: put «Реєстр» back in contactsNote and "Registry" in the en hint. Guard tests went red at `copy-status.test.ts:577/578`, naming the key, plus the FINAL pin at :327 | |
| Mutation: changed the block back to “…”. Went red at `AnimalDetailScreen.test.tsx:188,196` and `ProfileEditor.test.tsx:380`, each showing the expected and received strings. All files restored (sha256 checked) | |
| The donation claim is true. The public link is a direct `<a href={shelter.donation.url}>` (`AnimalDetailScreen.tsx:338-348`). There is no payment code (liqpay appears only in `donation.ts`'s host list). `forShelters.money` (#5) is unchanged | |
| The deck shows the sentence without quote marks (`SwipeCard.tsx:324-327`). Design README:283 says «…» for the sentence | |

## Findings

1. [low] `ShelterFreshnessBlock.tsx:16`: the comment "as everywhere else in the Ukrainian copy" is false. Three uk strings use „…“: `profileEdit.voice.emptyMeans`, `previewEmpty` (both in the same voice section as the preview) and the sign-in over-limit text at uk.ts:1276. Reword it to cite the design README only. Leaving those strings unchanged is correct (CB-B2 scope), but his "as everywhere else" may have meant them too. List it in the inbox as a question, not a fix.
2. [info] The claim that "the harness spec pins «…»" is a shape claim. The spec strips the marks (`animal-detail.harness.ts:436`), so it would also pass with “…”. The marks are pinned by the two component tests, which I mutated. Stripping «» is still necessary: without it, the `startsWith("Притулок")` guard is silently weakened. Describe it accurately in the commit body.
3. [info] Not caused by this diff: once next-intl is wired (H3), ICU will read `{імʼя}` in this hint, `nameStaysHint` and `insertName` as an argument. Today it stays literal.

No public claim changes meaning in a way the code contradicts. The contacts note's «без посередників» is consistent with commitment #4: no outbound messaging exists, and email is used only for kabinet invitations.

## Simplifications

None worth taking. The uk half of the guard overlaps the FINAL literals, but it survives a legitimate re-pin, and the en half is the only pin on the en mirrors.

## Tests

- `packages/i18n` copy-status.test.ts: 1 file, 131 passed.
- `apps/web` AnimalDetailScreen, ShelterProfile, ProfileEditor: 3 files, 81 passed.
- Harness: not run.
