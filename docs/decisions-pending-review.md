# Decisions pending Oleksii's review

Working log for the autonomous session started 2026-09-09, after PR #53 merged. Every
reversible judgement call made without asking goes here instead of blocking on an answer —
see `CLAUDE.md`'s working loop for the rule this implements. Newest entry last within each
section.

## Summary — read this first

**Rows completed this session:** R2 (two-action deck, not-a-judgement notice's permanent home),
R3 (inline reveal — the deck's «Написати» now opens a real reveal dialog without leaving the
deck).

**PRs open:**
- [#54](https://github.com/opika-ua/opika/pull/54) — `feat/deck-two-action` → `main`, R2. Two
  reviewer rounds (PASS WITH NOTES both), all findings addressed, `pnpm check` green. Not
  merged — merging stays yours.
- [#55](https://github.com/opika-ua/opika/pull/55) — `feat/deck-inline-reveal` →
  `feat/deck-two-action`, R3. **Draft, deliberately** — the gesture-parity/`RATE_LIMITED`-copy
  decision below is unresolved; the code itself is ready for review. Stacked on #54 (retarget to
  `main` once that merges). Three reviewer rounds: round 1 STOP (a real session double-mint bug,
  fixed; the gesture-parity decision, escalated below), rounds 2 and 3 PASS WITH NOTES (all
  findings addressed), `pnpm check` green.

**A real decision, not a reversible judgement call — needs your answer, not just your eye:**
R3's own reviewer round found that a right-**drag** gesture on the deck now spends one of the
adopter's 30 reveals/24h and writes a real, transactional `animals.reveal` row (decision #9's
Phase-2 reward-ledger event), exactly the same as a deliberate «Написати» press — the row never
decided whether that's the intended product, and it's reachable in seconds of normal browsing
(thirty drags exhausts a day's budget). Two sub-questions:
1. Gesture parity — should a right-drag reveal at all, or only «Написати» itself? Options: (a)
   both reveal (current, shipped as-is pending your answer); (b) drag records `interested` only,
   button reveals; (c) drag reveals but with a confirm step.
2. What an adopter who hits the 30/24h limit actually sees. `RATE_LIMITED` today renders
   `uk.errors.loadFailed` — «Щось не спрацювало на нашому боці. Це не ваша помилка і не
   помилка притулку.» — which is false in this state (it *is* a limit applied to them). Honest
   copy for it is new Ukrainian, not mine to invent, and R3 makes this state meaningfully more
   reachable than it was.
Nothing else in R3 depends on this being resolved before merge; it's recorded here rather than
blocking the branch.

**Decisions needing your eye (reversible, not blocking), ranked by cost to reverse:**
1. **[trivial to reverse] Notice hidden below 360px width, not shown everywhere.** See
   `R2 — notice geometry` below. A CSS class change; reversible in minutes if you'd rather see
   it smaller-but-present at 320 instead of absent.
2. **[trivial to reverse] Notice moved off the detail page entirely, not duplicated.** See
   `R2 — notice moved, not duplicated` below. Re-adding it there is a few lines if you disagree
   with the reasoning.
3. **[trivial to reverse] R3's deck reveal has no "back to gallery" link.** See
   `R3 — no secondary action on the deck` below. Adding one back needs new Ukrainian first
   (what should it say instead of "gallery"?) — flagged, not invented.
4. **[moderate to reverse — touches a harness assertion's own number] PHONE frame's exact photo
   height assertion repointed 396→386.** See `R2 — photo height assertion` below. Reversing
   means finding another 10px of vertical budget instead.
5. **[moderate to reverse — a real architecture choice] Reveal dialog + its state machine
   extracted into a new shared location, `apps/web/src/features/reveal/`.** See
   `R3 — where the shared reveal code lives` below. Reversing means re-inlining into one or
   both callers; `RevealFlow.test.tsx`'s 10 tests already prove the extraction changed nothing
   about the detail page's own behaviour, so this is a structure choice, not a behaviour one.

**Parked:**
- `R3 — focus-on-close has one uncovered edge case` — see below. Not blocking; a keyboard-focus
  gap in one narrow state (right-swipe on the last card), not a functional break.

---

## Decisions

## R2 — notice moved, not duplicated
Chose: moved the not-a-judgement notice from its interim home (detail page) to its permanent
one (the deck), removing it from the detail page rather than keeping it in both places.
Alternatives: keep it on both surfaces; keep it only on the detail page and never add it to the
deck.
Why this one: the sentence is about what a *swipe* decision means, and the detail page's own
«Не зараз» was never a swipe (a plain link back to the gallery, no exclusion recorded) — it
never needed the reassurance. `docs/build-plan.md`'s own R2 row description ("permanent home")
reads as a relocation, not an addition, and the interim comment on both the detail page and
`uk.ts` explicitly said "until the deck rebuild," not "in addition to."
Reversibility: trivial — re-adding the JSX block to `AnimalDetailScreen.tsx` is a few lines,
copy already exists.
Confidence: high.
Commit: 51ab9b1

## R2 — notice geometry
Chose: hid the not-a-judgement notice below 360px viewport width (`min-[360px]:block`) rather
than show it everywhere or shrink it further.
Alternatives: (a) show it everywhere and accept a real shelter-line clip at 320px width — no,
this repo's whole history is about never doing this; (b) compact the notice further (smaller
font) to try to fit at 320 too — tried what was reasonable (margin reclaims), the remaining
gap was ~18px, which a two-line-wrapped sentence at 13px can't close without going illegibly
small; (c) redesign the whole action-row/notice layout — bigger change, not clearly better.
Why this one: `ANDROID_PHONE` (360, this product's actual stated target audience per
`docs/stack-decision.md`) shows the notice with real slack. `NARROW_PHONE` (320) is documented
in its own file as "the narrowest width still worth calling a real device," not the target —
and the shelter line (the animal/shelter identity) must never be what gives.
Reversibility: trivial — one Tailwind class.
Confidence: medium — the 360px cutoff is a judgement call, not a hard product decision from you.
Commit: 51ab9b1

## R2 — photo height assertion
Chose: updated `discovery-layout.harness.ts`'s exact `photo area === 396px` assertion (at the
canonical `PHONE`/390x844 frame) to `386px`, with a comment explaining the real, deliberate
cause (the new notice line), rather than finding another 10px of vertical budget to preserve
396 exactly.
Alternatives: keep hunting for 10 more px of margin somewhere else in the deck's chrome; make
the notice's own typography smaller than the detail page's (breaking visual parity between the
two surfaces where it does appear).
Why this one: this is an exact-equality regression test, not a floor with slack —
`docs/standing-constraints.md`'s "the mutation for a floor is crossing it, not perturbing the
measurement" governs *floor* tests, not this one. The test's own comment already documents two
prior precedents for exactly this situation (a deliberate content change legitimately moving
the number).
Reversibility: moderate — reversing means finding the missing 10px elsewhere, not just editing
a number back.
Confidence: high.
Commit: 51ab9b1

## R3 — where the shared reveal code lives
Chose: extracted the reveal dialog and its bootstrap-then-reveal state machine out of
`RevealFlow.tsx` into a new `apps/web/src/features/reveal/` directory (`ContactRevealDialog.tsx`,
`useReveal.ts`), imported by both the detail page (`RevealFlow.tsx`, now just the trigger button
+ framing) and the deck (`SwipeDeck.tsx`).
Alternatives: (a) duplicate the dialog/state-machine logic into `SwipeDeck.tsx` — rejected,
this is a genuinely large, a11y-critical component (focus trap, Esc, scroll lock, error/loading
states) that this codebase already got wrong once before it was fixed; a second copy is a
second place for that fix to rot out of sync. (b) Have `discovery/` import directly from
`animal-detail/` — rejected, an awkward cross-feature dependency where neither feature is
obviously the "owner" of reveal semantics. (c) Move it into `packages/ui` — rejected, that
package is deliberately dependency-light (only `@opika/domain` + `@opika/i18n`, no React
dependency declared at all today) and holds pure presentational primitives, not a
data-fetching, focus-trapping compound component.
Why this one: "reveal" (contact disclosure) is its own domain concept, distinct from both
"animal-detail" and "discovery" — a new feature directory matches this repo's own "modular by
feature/domain" convention better than shoehorning it into either existing feature's directory.
`RevealFlow.test.tsx`'s existing 10 tests pass completely unchanged against the extraction,
which is the actual proof this didn't alter detail-page behaviour — a refactor, not a rewrite.
Reversibility: moderate — re-inlining is mechanical (move the code back into one file) but
touches both callers.
Confidence: medium — the architecture call itself (new feature directory vs. an existing one)
is the kind of thing you might have a house-style opinion on that I don't have visibility into.
Commit: 69ab6bf

## R3 — cityName: implemented, not cut (supersedes an earlier version of this entry)
An earlier draft of this row chose `cityName: null` unconditionally, on the stated reason that
no `cityId -> name` lookup existed anywhere in the deck. **That reason was wrong, caught on
review**: `GortatyPage`'s server component already built exactly that map for its own
`filtersInWords` call (the header's filter-summary text) and discarded it after use — the data
was one prop-thread away, not a new fetch or a contract change.
Chose instead: converted the existing map to a plain object (`Object.fromEntries`, for a clean
server/client boundary — passing the `Map` itself was avoidable rather than necessary) and
threaded it through `DeckScreen.tsx` into `SwipeDeck.tsx`, which resolves the swiped animal's
real city via `cardCityId` (`../gallery/card-text.ts`) — the exact helper the gallery's own
cards already use for the same lookup. `cityName` is `null` now only when a city is genuinely
missing from the lookup (a real data gap), never as a blanket default.
`cityNames` is optional with a default `{}` at both `DeckScreen` and `SwipeDeck`, to avoid
touching every unrelated existing test — the one production caller (`GortatyPage`) always
passes real data, so the default is a test convenience, not a live code path.
Reversibility: trivial to revert to `null` if you'd rather the deck's reveal stayed intentionally
vaguer about location for some reason; the real lookup is a bigger loss to give back than it was
to add.
Confidence: high — this was a corrected mistake, not a judgement call.
Commit: 69ab6bf

## R3 — no secondary action on the deck
Chose: the deck's own `ContactRevealDialog` instance passes no `secondaryAction` at all — no
"back to X" text link in the footer, unlike the detail page's «Повернутися до галереї».
Alternatives: (a) add a deck-specific link with new Ukrainian ("back to the deck," or similar)
— rejected without your copy, per the standing rule against inventing Ukrainian for a surface a
visitor sees; (b) reuse «Повернутися до галереї» verbatim even though the deck's dialog isn't
reachable from a gallery in this session and the link would misdescribe where it goes —
rejected, that would be worse than no link, not better.
Why this one: R3's own stated requirement is "the deck session must survive a reveal — no exit
back to the gallery," and a link *back to the gallery* is exactly the exit that requirement
rules out. The ✕ and Esc already close the dialog cleanly, staying on the deck — a real,
if less-visually-anchored, way out.
Reversibility: trivial once the Ukrainian exists — one `secondaryAction` prop, matching the
detail page's own usage exactly.
Confidence: high on the "no gallery link" half; if you want a deck-specific dismiss link at
all, that's a design call and needs its own copy.
Commit: 69ab6bf

---

## PARKED

### R3 — focus-on-close has one uncovered edge case
What's blocked: `SwipeDeck.tsx`'s `closeRevealAndRefocus` returns focus to the «Написати»
button on close, matching `RevealFlow.tsx`'s own contract — except when the reveal-opening
swipe was on the *last* card, which exhausts the deck and unmounts «Написати» (and its ref)
while the dialog is still open. Closing then finds `writeButtonRef.current === null` and
silently no-ops; focus falls back to the browser's default (`<body>` in practice), the same gap
the whole fix exists to close, in this one reachable state.
What's needed to unblock: `ExhaustedState` (`SwipeDeck.tsx`) renders no focusable element of
its own to fall back to — closing this properly means giving it one (or threading a ref to
some other stable element, like the deck header's "back to list" button, which
`SwipeDeck.tsx` has no access to today since it lives in the parent `DeckScreen.tsx`).
Estimate once unblocked: small, maybe half an hour — mostly deciding *which* element should
receive focus in the exhausted state, which is a design call more than an engineering one.
