# Review — 4aa7f6d (feat/deck-loading-error-v2), Tier 2, async

VERDICT: PASS WITH NOTES

VERIFIED                                                        | TAKEN ON TRUST
--------------------------------------------------------------- | -------------------------------------------
`SwipeDeck.test.tsx` run: 21/21 pass                            | Full `pnpm check` (pasted in commit body, read: 1005 unit + 217 harness, biome clean)
Harness "/tvaryny/gortaty error state": 2/2 pass (48px, focus ring) | Rendered colours of the new card/button (no screenshot taken; classes resolve to defined tokens, build green)
Deck root is `bg-rg-page` (DeckScreen.tsx:125), same as gallery error.tsx:123, so a borderless white card has the same fill-contrast separation the design prescribes (README "borders are gone") | —
ink-3 on surface = 5.9:1 (README contrast table; my own calc 5.7:1), passes AA | —
Focus ring matches README:201 exactly (3px #1B3A6B, offset 3px); the 3px offset sits on the white card, so the ring is separated from the black fill by a white gap (11.3:1 ring vs surface) | —
No new guard, so no mutation required; none claimed | —

## FINDINGS (most severe first)

1. [medium] SwipeDeck.tsx:534 — DLE-1 promotes retry to the primary treatment but keeps the secondary-sized `min-h-12 text-sm`. The prose spec says "56 primary actions" (docs/design/README.md, Touch targets); the deck's own primary `ActionButton` is `min-h-14 text-[15px] leading-none` (SwipeDeck.tsx:426) and the gallery retry it was copied from is `min-h-14 … text-[15px]` (error.tsx:146).
   Failure scenario: a user sees a black primary button 8px shorter, with smaller text, than every other black primary button in the same deck and in the gallery's matching error card.
   Fix: `min-h-14 text-[15px]`. Optionally raise the harness floor for this one control to 56. DLE-1 itself is sound: README:49 says "The primary action is black", and with only one action, that action is the primary one. It's the sizing that's off.

2. [low] SwipeDeck.tsx:497 (eyebrow) — `text-[11px]` in `rg-ink-3`. README:105 says "ink-3 is restricted to 13px+ captions and labels". The contrast passes AA, but per standing constraints a technical pass doesn't close a design requirement. The gallery reference uses 12px with `tracking-[0.08em] uppercase`, so 11px/0.12em doesn't match it either. Not a regression (the old code was 11px too), but this commit claims to be synthesised from the gallery. Either match the gallery, or record the deviation in DLE.

3. [low] SwipeDeck.tsx:461–464 comment, DLE-2, commit body — the comment cites "commitment #7" as the source for `rg-registry` being reserved. Commitment #7 is about the freshness date wording ("коли інформацію востаннє оновлювали"), not the colour. The correct source is docs/design/README.md:52 and :107–108. The rationale is true but the citation is wrong, and per standing constraints a wrong citation is a defective comment.

4. [low] Commit body only — "no surface mixes rg- tokens with the old serif/sans split" is false: DeckScreen.tsx:125 (`bg-rg-page … font-sans`) and SwipeDeck.tsx:357 (`font-sans … text-rg-ink-3`). This doesn't affect the code. Don't repeat it in the PR body.

Scope: clean. ExhaustedState is untouched as stated. The F6 row edit runs past the five-line diet, but it extends an existing row, so it passes.

## SIMPLIFICATIONS
- SwipeDeck.tsx:497–503 — the 14-line provenance comment duplicates DLE-1 and the commit body. Cut it to two lines pointing at DLE-1. Nothing breaks.

## TESTS
- apps/web `SwipeDeck.test.tsx`: Test Files 1 passed (1) / Tests 21 passed (21)
- harness `-g "gortaty error state"`: 3 passed (setup + 2), 11.0s
