# Review: c3cf4c9 (fix/voice-hint-false-claim, PR #102), Tier 2, async

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
Substitution claim is false. `git grep` across apps/ and packages/ finds no `{date}`/`{name}` replacement on `freshnessSentence` anywhere. Detail page: `textIn(...)` verbatim (AnimalDetailScreen.tsx:249). Deck: `shelterSentence.uk` raw (SwipeCard.tsx). Kabinet: `view.freshnessSentence?.uk` raw (ShelterProfile.tsx:207). Gallery cards don't render it. The only `{name}` replace near freshness is `resolved.sentence` (AnimalCard.tsx:235), which is our own catalogue string and not the shelter's. No OG/meta use. | The full `pnpm check` (exit 0, workspace 2568, harness 226). It's pasted in the commit body and I did not re-run it.
The first sentence is a verbatim prefix of the previously shipped uk/en string, so no new Ukrainian is introduced. The deletion is correctly scoped. | Whether «написане вами» holds while the operator enters the sentence via `onboard-shelter`. I'm reading it as authorship, the same footing as commitment #6.
Docs: standing-constraints #7 and h2-copy-sheet.md don't repeat the claim. prytulkam-argument.md:164 ("a date the system fills in") is true of the day-count label. |
Touched suites: i18n 57/57, ShelterProfile.test.tsx 17/17. |

FINDINGS (most severe first)
1. [medium] packages/i18n/src/messages/uk.ts:252 `freshness.attribution` «Слова притулку · дата автоматична» renders right under the quote on the adopter-facing animal page (AnimalDetailScreen.tsx:252, harness animal-detail.harness.ts:454).
   - docs/design/README.md:287-289 says this line exists *because* the platform substitutes the date into the quote.
   - Nothing substitutes, so a sentence like the design's own «Ми оновлювали цю картку 25 червня» would show a date the shelter typed by hand, labelled "date automatic".
   - Read charitably, «дата» means the pips/day-count label above, which *is* automatic. Read as the design intends, it is the same false claim this commit deletes.
   - This diff doesn't touch it, so it's not a STOP here. It needs Oleksii's reading. If he reads it as false, deleting «· дата автоматична» goes through the same no-gate path.
2. [medium] The design-vs-code collision is resolved silently.
   - README:288, KABINET.md:62-63 (constraint 9), :236 and :384 (N11 tokens + live preview) all *specify* substitution. It was never built.
   - Deleting the caption is right. But the commit records neither a follow-up nor an inbox row (`docs/decisions-inbox/fix-voice-hint-false-claim.md`: build substitution in K2/N11, or amend the design).
   - The new shelter.ts:19-22 comment calls it "an earlier note", but it is a live design requirement. The comment should say "specified in docs/design/README.md, not built".
3. [low] No regression guard. Nothing would go red if the braces came back in `voiceNote`. One assertion in ShelterProfile.test.tsx would cover it: the rendered caption contains no `{`. Don't compare it against `t.voiceNote`.
4. [low] docs/decisions-inbox.md:174 (KS-C2) and docs/reviews/feat-h2-invite/copy-final.md:33 still describe the substitution. Both are historical records, so leave them. copy-final's request to add `voiceNote` to #7's watch list is now moot.

SIMPLIFICATIONS
- None. Note that the 5-line doc-comment in uk.ts:900-905 duplicates the commit message. It could shrink to one line pointing at the inbox row once that exists. Nothing breaks either way.

TESTS
- @opika/i18n: Test Files 4 passed, Tests 57 passed (57)
- @opika/web src/features/kabinet/ShelterProfile.test.tsx: Test Files 1 passed, Tests 17 passed (17)
- No new guard in the diff, so no mutation was required or run.
