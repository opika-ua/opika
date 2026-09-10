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

**Reviewer round: STOP.** Not proceeding — full reasoning below, this is the load-bearing entry
in this file now, everything above is superseded by it.

## STOP — PR #55 already exists and implements this more completely

The reviewer found `feat/deck-inline-reveal` (PR #55, draft, opened 2026-09-09T20:30, "R3: inline
reveal — the deck's «Написати» opens a real reveal") before this branch's work started. Built
independently, with no knowledge of it — this branch duplicates its structure almost exactly
(same `apps/web/src/features/reveal/` directory, same extraction of `RevealFlow.tsx`'s state
machine and dialog) but is strictly worse on every point that differs:

- **City name.** This branch passes `cityName={null}` to the deck's dialog, justified in an
  earlier version of this file as "no resolved city name is available client-side" — the
  reviewer found that claim **false**: `app/tvaryny/gortaty/page.tsx` already builds a city
  lookup from `cities.list` for exactly this purpose, and #55 already wires it through.
- **The race the reviewer's own finding #1 found** (two right-commits inside the loading window
  can mismatch animal name against shelter contact, or land dialog content from a stale request)
  is closed on #55 by a generation guard — this branch has none.
- **#55 fixed a real session double-mint bug** (two distinct session tokens minted on one
  swipe+reveal, reproduced against a real server and real seeded Postgres) that this branch never
  discovered, because it never ran against a real server.
- **#55 has real Playwright harness coverage** (`discovery-reveal.harness.ts`) for the deck's
  reveal geometry and focus behaviour. This branch has none — the reviewer's own review could
  only run the unit suite, explicitly flagging harness coverage as untested.
- **#55 already escalated the exact two questions Oleksii's own 2026-09-10 status call answered**
  — "should a right-drag reveal at all, or only the button" and the `RATE_LIMITED` copy — and has
  been sitting in draft waiting specifically for those answers.

**Recommendation: close this branch, finish PR #55 instead.** #55's own two blocking questions
are now answered (gesture parity approved; rate-limit copy is Oleksii's own sentence, pending,
per the same status call) — it needs those answers applied and a final commit, not a parallel
implementation competing with three rounds of review it already passed.

**Secondary findings, real regardless of which branch survives** (the reviewer's own ranking,
most severe first — apply to whichever implementation continues):
1. No in-flight guard on the reveal call — two rapid right-commits can mismatch dialog content
   between two different animals/shelters. (#55 already fixes this via a generation guard —
   confirms the above recommendation rather than adding new work.)
2. The `direction === "right"` branch gating `onReveal` had no test — a mutation removing the
   gate entirely (so a left-swipe also reveals) left the whole discovery suite green.
3. The deck's Escape-to-exit guard keys on `isOpen`, which is false while the reveal request is
   still in flight — Escape during that window exits the deck via `router.back()` with a unit
   already spent and no dialog ever shown, contradicting R3's own "the deck session must survive
   a reveal — no exit back to the gallery."
4. The committed card is consumed (recorded, 30-day exclusion) unconditionally, independent of
   whether the reveal itself actually succeeds.

Three decisions the reviewer named as needing Oleksii specifically, not resolvable by either
agent alone: (a) which PR survives — #55 or this one; (b) merge order against #58 (the
reveal-counting fix) — gesture parity's own safety argument depends on it being live, and #58 is
not yet merged; (c) the mock's own bottom-action-bar spec is empty for a `viber`/`website`-primary
shelter on the deck, since no Ukrainian "back to the deck" string exists yet to fill it — needs
either that string or an explicit decision to accept an empty footer for that one case.

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
