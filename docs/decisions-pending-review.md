# Decisions pending Oleksii's review

Working log for the autonomous session started 2026-09-09. Every reversible judgement call made
without asking goes here instead of blocking on an answer — see `CLAUDE.md`'s working loop for
the rule this implements. Newest entry last within each section.

**Note on history:** this file's prior content (R2) shipped via PR #54, merged into `main`.
Replaced here rather than left to read as still-pending, per "one document per subject...
when superseded, replace it."

## Summary — read this first

**Row completed this session:** deck gesture parity — a right commit (drag or the «Написати»
button, already the same code path before this row) now opens the real reveal, the same dialog
the detail page's `RevealFlow` already used. Oleksii's own approval (2026-09-10 status call),
contingent on the reveal budget counting distinct shelters rather than reveal actions — that
half is PR #58, open separately.

**PR:** not yet opened — see this file once it is.

**Depends on #58, loosely:** this branch's code does not require #58 to merge first — it
doesn't touch `reveal-rate-limit.ts` at all, and works correctly against either the old or the
new counting. But the *safety argument* Oleksii approved gesture parity on ("an accidental
repeat drag on an already-revealed shelter costs nothing") only holds once #58's per-shelter
counting is live. Mergeable in either order; flagging the dependency so it isn't merged and
then forgotten.

**What changed:**
- Extracted the reveal state machine (`use-reveal-flow.ts`) and dialog rendering
  (`RevealDialog.tsx`) out of `RevealFlow.tsx` into `apps/web/src/features/reveal/` — the detail
  page's own behaviour is unchanged (`RevealFlow.test.tsx`'s 10 existing tests pass unmodified,
  proving the extraction is behaviour-preserving), and the deck now shares the same dialog rather
  than a second, drifting copy.
- `SwipeDeck.tsx` gained an `onReveal?: (card: FeedCardView) => void` prop, called from
  `handleCommit` on a right commit, with the card captured before `onSwipe` shifts it out of
  `state.cards` (the deck still advances synchronously, unchanged from R1 — gesture parity adds
  a dialog on top, it doesn't gate the advance on the reveal resolving).
- `DeckScreen.tsx` owns the reveal state via `useRevealFlow`, renders `RevealDialog` as an
  overlay, and fixed a real conflict the design's own keyboard table predicts but nothing built
  yet exercised: `DeckScreen`'s own Escape-to-exit handler and the reveal dialog's Escape-to-close
  handler would otherwise both fire on the same keypress. Guarded so Escape closes the topmost
  thing (the dialog) first, matching `docs/design/README.md`'s "Esc — close the sheet, the
  contact modal, or leave the deck."

**Two disclosed simplifications, not oversights:**
1. **`cityName` is always `null` for the deck's reveal dialog.** `FeedCardView.publicLocation`
   carries only a `cityId`, not a resolved display name, and the deck has no city-lookup table
   client-side the way the gallery's server-rendered props do. `RevealDialog`'s existing
   `cityName={null}` path already renders correctly (falls back to the meeting-place sentence
   alone) — not a special case, an existing branch. Extending `FeedCardView` to carry a resolved
   name would be a contract change, out of this row's scope.
2. **The dialog's "Повернутися до галереї" (back to gallery) link is omitted for the deck**
   (`showBackLink={false}`), not relabelled. That sentence is false when the trigger was the
   deck — the user isn't in the gallery — and there is no accurate Ukrainian string for "back to
   the deck" yet. Writing one is new user-facing copy, a Tier 1 gate this row doesn't cross
   unasked. Per "removing a false claim is not the same gate as adding one"
   (`docs/standing-constraints.md`), omitting the link needed no new copy — the ✕ close button
   (unconditional, existing `uk.actions.notNow` label) already closes the dialog either way, so
   nothing is lost except a redundant, wrong-destination second control.

**Reviewer round:** not yet run — see this file once it has.

**Decisions needing your eye (reversible, not blocking):**
1. **[trivial to reverse] Focus returns to the deck header's "back to list" button on close**,
   not a per-card element (none is stable enough to hold a ref across commits the way the detail
   page's own trigger button is). A judgement call, not a spec — reversible by pointing the ref
   elsewhere.
2. **[moderate to reverse — new Ukrainian copy, Tier 1] The missing "back to the deck" string.**
   Once you have a sentence for it, `showBackLink` becomes a real label prop instead of a
   boolean, and the omission goes away. Not urgent — the ✕ close button is a complete, working
   substitute today.

**Parked:**
(none)
