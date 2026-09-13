# Decisions pending Oleksii's review

Working log for the autonomous session started 2026-09-09, after PR #53 merged. Every
reversible judgement call made without asking goes here instead of blocking on an answer —
see `CLAUDE.md`'s working loop for the rule this implements. Newest entry last within each
section.

**Note on history:** this file's prior content (R2 — notice moved/notice geometry/photo height
assertion) shipped via PR #54, merged into `main`. Replaced here rather than left to read as
still-pending, per "one document per subject... when superseded, replace it."

**Note on history:** R2 (`feat/deck-two-action`, PR #54) merged into `main` first — this file's
own R2 section below is folded in from that branch's copy, reconciled by hand as its own header
note said it would need to be. `feat/city-slugs` (Phase S, PR #56) is still open and still carries
its own separate copy of this file; expect the same reconciliation again when it merges.

**Note on history, 2026-09-12:** `feat/deck-inline-reveal` (R3, PR #55) and `main` (which had by
then gained Phase K/PR #57, the reveal-budget fix/PR #58, and this branch's own merge) each grew
this file independently after branching from the same R2 base — reconciled by hand again here,
same pattern as the note above. Nothing was dropped; every decision entry from both copies
survives below, and the "Filed, not fixed: O-20" note from `main`'s copy is updated to reflect
that O-20 has since been fixed (PR #60, opened the same day as this reconciliation).

## Summary — read this first

**Rows completed this session:** R2 (two-action deck, not-a-judgement notice's permanent home,
merged via PR #54), Phase K (the polish batch), the reveal budget fix (distinct-shelter
counting), R3 (inline reveal — the deck's «Написати» now opens a real reveal dialog without
leaving the deck), D-2 (demo-mode verification/realness gating), and O-20 (real HTTP statuses
for API error codes).

**R2 — merged.** `feat/deck-two-action` → `main` via PR #54. Two reviewer rounds (PASS WITH NOTES
both), all findings addressed, `pnpm check` green.

**Phase K — the polish batch** (`docs/build-plan.md`'s reprioritisation queue item 6), covering
O-1, O-4, O-5, O-8, O-11, O-13, O-14 from `docs/observations.md`.

**PR:** [#57](https://github.com/opika-ua/opika/pull/57), open against `main`, not merged.

**Disposition per item:** five done (O-1, O-5, O-8, O-11, O-13), one checked and closed with no
code change (O-4 — the mock itself specifies the spacing already implemented), one parked
(O-14 — see below).

**A real decision, not made here — parked for Oleksii:** O-14 (informative pages feel too
narrow on large screens) needs an actual composition choice with no mock to open —
`docs/design/README.md` has no section for `/pro` or `/prytulkam` at all, confirmed by grep.
`docs/standing-constraints.md`'s "ambiguous design with no mock" is on the working loop's own
stop-and-ask list regardless of what a reviewer would say, so nothing was picked unilaterally.
Two concrete directions are recorded in `docs/observations.md`'s O-14 entry, with a
recommendation, for Oleksii to choose from.

**Reviewer round: PASS WITH NOTES**, after independently verifying every claim (read the actual
design-doc sections and the mock file itself, ran the real test suites, mutation-tested the two
regressions this row's own build-plan entry already documents). Found and fixed: the footer's
two links rendered at 18px against the 48px touch-target floor (`docs/design/README.md:200`) —
fixed and pinned with a mutation-confirmed harness assertion; two places (this file's own O-8
bullet, `SiteHeader.tsx`'s top comment) still claimed `flex-wrap` had been removed, contradicted
by the very next paragraph documenting its restoration — both corrected; a test claiming to
guard the logo mark's `aria-hidden` attribute never actually asserted it — rewritten to check the
attribute directly; and a comment claiming the mark-to-wordmark gap exactly equals "the dot's own
height" when the literal spec value scales to under 4px at this size — corrected to record the
12px gap as a deliberate rounding, not a false equivalence. Full detail:
`docs/build-plan.md`'s own Phase K entry.

**Phase K decisions needing your eye (reversible, not blocking), ranked by cost to reverse:**
1. **[trivial to reverse] O-4 closed with no code change** — the mock's own computed spacing
   for a filter label+chip-row group is `gap: 12px`, exactly what `FilterRail.tsx`/
   `FilterSheet.tsx` already render. See `Phase K — O-4: the mock itself specifies the spacing`
   below. If it still reads as tight in practice, widening it is a one-line class change, but a
   real design-system deviation, not a bug fix.
2. **[trivial to reverse] The footer echoes both site-nav links, not just the font credit.** See
   `Phase K — footer content: both nav links, not just the credit` below. Dropping the second
   link back to the original single-link fragment is a few lines.
3. **[moderate to reverse — a real per-bracket choice] The new ultrawide grid bracket's column
   width matches the existing wide bracket's exactly (312px), rather than a wider column now
   that there's more room.** See `Phase K — O-5: same column width, more columns` below.
   Reversing means picking new numbers and re-deriving the `sizes` attribute and every harness
   assertion that depends on them.

**Parked:** O-14's composition choice — see above and `docs/observations.md`'s own entry for
the two options and a recommendation.

**Row completed:** the reveal rate limit now counts distinct shelters, not reveal
actions — Oleksii's own diagnosis and instruction (§55 status call, 2026-09-10), not a
unilateral decision.

**PR:** [#58](https://github.com/opika-ua/opika/pull/58), open against `main`, not merged.

**What changed:** `checkRevealRateLimit` (`apps/web/src/api/reveal-rate-limit.ts`) takes the
target `shelterId`. Free re-reveal if this adopter already revealed this shelter within the 24h
window (a new `hasRevealedShelterRecently` existence check); otherwise the 30-per-24h budget now
bounds `COUNT(DISTINCT shelter_id)`, not raw reveal-row count. `reveals.shelter_id` already
existed with its own index — no migration.

**Reviewer round: PASS WITH NOTES**, two high findings fixed before commit:
1. `hasRevealedShelterRecently`'s adopter-scoping had no test proving it was load-bearing —
   deleting the `adopterId` condition left every test green. Added: adopter B, already at their
   own 30-shelter cap, targeting a shelter only adopter A ever revealed, must still be
   rate-limited. Mutation-confirmed red without the fix.
2. The 30-shelter budget was only pinned from above (blocked at 30) — a mutation to `maxReveals:
   29` passed every test. Added: 29 distinct shelters must not rate-limit a 30th. Mutation-
   confirmed red without the fix.

Three medium findings addressed by correcting doc comments rather than code (the reviewer's own
call on which route was right): a math error in the "cheap existence check" claim (real-corpus
`EXPLAIN` showed it isn't cheap when a popular shelter has many other adopters' rows — comment
now says so rather than overclaiming); a "gesture parity is closed by this change" overclaim
(only *repeat* accidental drags become free — a first-time accidental drag on a never-revealed
shelter still spends a unit and still irreversibly discloses contact details, same as an
accidental button tap always did); CLAUDE.md's decision #14 correction note understated the
change (added the free-re-reveal short-circuit to the description, not just the aggregate
change).

**Fixed, 2026-09-12 (was "filed, not fixed" in an earlier version of this section):** O-20
(`docs/observations.md`) — `RATE_LIMITED` and other `ORPCError` codes carried no HTTP status
mapping and answered bare `500`. **PR:** [#60](https://github.com/opika-ua/opika/pull/60), open
against `main`, not merged. `apiErrors` (`packages/contracts/src/errors.ts`) now declares a real
status per code; every handler constructs via oRPC's own injected `errors.CODE()` rather than a
raw `new ORPCError(code)`. Reviewer found a real coverage gap on first pass (`ANIMAL_NOT_AVAILABLE`
and `SHELTER_NOT_VISIBLE` had no test at any status) — fixed, two new cases added to
`api.test.ts`'s `reveal` describe block.

**Decisions needing your eye (reversible, not blocking):**
1. **[trivial to reverse] Two sequential queries (existence check, then distinct count) rather
   than one combined query.** The reviewer measured the two-query shape as faster for the common
   case (a repeat reveal short-circuits before ever running the more expensive distinct-count
   query) and slower for the rare one (a first-time reveal pays both). Combining them into one
   query (`count(distinct shelter_id), bool_or(shelter_id = $target)`) trades one for the other.
   Not changed — the common case is the one worth optimising for, but it's a real trade, not a
   free simplification, so it's flagged rather than assumed.
2. **[trivial to reverse] `checkRevealRateLimit`'s new `shelterId` parameter reuses the shelter
   object `reveal.ts`'s handler already fetched** for verification-status checking, rather than
   a second lookup. Confirmed safe: `shelter.id` cannot diverge from `animal.shelterId` — the
   fetch is keyed on it.

**PRs open:**
- [#55](https://github.com/opika-ua/opika/pull/55) — `feat/deck-inline-reveal` → `main`, R3.
  **Draft, deliberately** — the `RATE_LIMITED`-copy question below is the one remaining blocker;
  gesture parity itself is decided (see below) and implemented. Five reviewer rounds: round 1
  STOP (a real session double-mint bug, fixed; the gesture-parity question, escalated at the
  time), rounds 2–3 PASS WITH NOTES (all findings addressed). Retargeted to `main` and merged
  forward (2026-09-12) once #54, #57, and #58 landed ahead of it — a squash-merge history
  reconciliation, not new conflicting content; verified the pre-merge and post-merge code was
  byte-identical everywhere `git merge` reported a conflict, before resolving each in favour of
  this branch's own (superset) content. Round 4, on this row's first gesture-parity
  implementation attempt, PASS WITH NOTES but with a real high finding: a real-DOM probe proved
  the guard (inside `handleCommit`) fired too late to undo anything (see `R3 — gesture parity`
  below for the full story). Round 5, on the actual fix, PASS WITH NOTES — `pnpm check` green.

**Decided — gesture parity, 2026-09-12.** Asked directly: "should dragging a card to the right do
exactly what the «Написати» button does, including spending one unit of the reveal budget?" His
answer, verbatim: **"yes."** A right-drag reveals the shelter's contact inline and counts against
the budget, identically to tapping «Написати». Reasoning given alongside that answer, paraphrased
here rather than quoted verbatim: a right-drag that does not reveal is indistinguishable from a
skip, which recreates the «Далі» problem R2 removed; and since #58 (above) counts distinct
shelters rather than reveal actions, an accidental drag on an already-revealed shelter costs
nothing. This is not an inference and not "approved" — the question was asked directly, his
answer is quoted verbatim, and the reasoning is his own but not his exact words, all on this
date, per `docs/standing-constraints.md`'s "Only Oleksii's own words constitute approval." See
`R3 — gesture parity: decided, and its own re-entrancy gap closed` below for what changed in
the code as a result.

**Still open — the `RATE_LIMITED` sentence. This is #55's only remaining blocker.** What an
adopter who hits the 30/24h limit actually sees. `RATE_LIMITED` today renders
`uk.errors.loadFailed` — «Щось не спрацювало на нашому боці. Це не ваша помилка і не помилка
притулку.» — which is false in this state (it *is* a limit applied to them). Honest copy for it
is new Ukrainian, not mine to invent, and R3 makes this state meaningfully more reachable than it
was now that gesture parity is confirmed on. **Technically unblocked either way** — O-20 (above)
means a real 429 reaches the client on the wire, and the client-side code check (`isDefinedError`
+ `code === "RATE_LIMITED"`) already worked before O-20 too, per that PR's own reviewer note;
what's still missing is the copy sentence itself, nothing technical. #55 stays in draft until it
arrives.

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

**Rows completed after this file's last reconciliation (2026-09-11/12):** D-2 (every demo-mode
verification/realness claim gated from one place — two production regressions Oleksii asked to
be verified before any fix; **PR** [#59](https://github.com/opika-ua/opika/pull/59), open
against `main`, not merged, two reviewer rounds both PASS WITH NOTES, all findings addressed)
and O-20 (see above).

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

## Reveal budget — counts distinct shelters, not reveal rows
Chose: `COUNT(DISTINCT shelter_id)` over the 24h window, with a free short-circuit for a shelter
already revealed by this adopter in that window — exactly Oleksii's own instruction, not a
judgement call between alternatives.
Why: contacts are scrapeable per shelter, not per animal — the old row-count let a device
right-swiping 40 cards across 6 shelters burn 40 units to see 6 phone numbers, which was the
counter measuring the wrong quantity, not the budget being genuinely tight.
Reversibility: trivial to revert the counting change itself (swap `countDistinct` back to
`count()`, drop the short-circuit); the seven tests pinning this behaviour would need reverting
alongside it or they'd fail against the reverted code.
Confidence: high — implementation matches the instruction's own wording exactly
(`COUNT(DISTINCT shelter_id)`), independently mutation-tested per finding.
Commit: 60d69a1.

## Phase K — O-4: the mock itself specifies the spacing
Chose: no code change. Checked `Opika Registry System.dc.html`'s own computed styles for a
filter label+chip-row group before touching anything, per O-4's own instruction ("open the mock
before changing anything"). Found `gap: 12px` — exactly what `FilterRail.tsx`/`FilterSheet.tsx`
already render (`gap-3`).
Alternatives: widen the gap anyway, on the theory that "looks tight" is evidence enough
regardless of what the mock says.
Why this one: the design doc is the stated authority for exactly this kind of question, and it
already answered it. Widening past a checked, matching mock value would be an unreviewed design
deviation wearing a bug-fix label — the same trap `docs/standing-constraints.md`'s "time is not
a decision input" section was written to prevent, applied to "looks tight" instead of a
deadline.
Reversibility: trivial if wrong — a one-line class change, `gap-3` to whatever's chosen.
Confidence: high on "the mock says 12px"; the aesthetic judgement of whether 12px is actually
too tight in practice is Oleksii's, not something this entry settles.
Commit: 8ece045 (fixes: 6c9b1ce), PR #57.

## Phase K — footer content: both nav links, not just the credit
Chose: the new shared `Footer` carries both existing site-nav links (`uk.nav.forShelters` and
`uk.nav.about`), not just the font-credit-plus-`/pro`-link the original one-off fragment had.
Alternatives: keep exactly the original fragment's content (credit + `/pro` only), building
nothing new into it beyond relocating it.
Why this one: O-11's own wording asks for "secondary links," plural, and both links already
exist verbatim in `SiteHeader`'s own nav — echoing them at the foot of a long page (the
motivating case for `SiteHeader` reaching `/pro` from the header at all was a ten-page gallery
grid) is new *placement*, not new copy. Suppressed on the page it would point at
(`currentPage` prop), the same self-link avoidance `SiteHeader.wordmarkIsCurrentPage` already
uses, so `/pro` and `/prytulkam` never link to themselves from their own footer.
Reversibility: trivial — delete one `<Link>` and its conditional.
Confidence: high — no new copy, reuses an existing self-link-avoidance pattern.
Commit: 8ece045 (fixes: 6c9b1ce), PR #57.

## Phase K — O-5: same column width, more columns
Chose: the new ultrawide bracket (2000px+, 6 columns) uses the same ~312px column width the
existing wide bracket (1440-1999px, 4 columns) already reaches, rather than a wider column now
that the viewport has more room to give.
Alternatives: derive a new, larger column width for the ultrawide bracket, giving each card more
presence on very wide monitors instead of just showing more of them at the same size.
Why this one: O-5's own decision text says "the grid gains columns... and uses the screen" —
read as "show more," not "show bigger." Keeping the same column width also means the card does
not visually resize at the 2000px boundary, which a wider column would.
Reversibility: moderate — reversing means picking new numbers, re-deriving `AnimalCard.tsx`'s
`sizes` attribute for the new width, and updating every harness assertion (`gallery-layout.
harness.ts`, `gallery-photo-sizes.harness.ts`) that currently expects 312px/288px at this
bracket.
Confidence: medium — a real interpretation call on ambiguous decision wording, not a mechanical
derivation from a mock (none exists above 1440px).
Commit: 8ece045 (fixes: 6c9b1ce), PR #57.

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

## R3 — gesture parity: decided, and its own re-entrancy gap closed
Chose: implemented Oleksii's own decision (2026-09-12, see the Summary section above for the
exact question, his verbatim answer, and the reasoning) — a right-drag on the deck reveals the
shelter's contact inline and spends one reveal-budget unit, identically to «Написати». This was
already structurally true in the code (`handleCommit` is the single shared path both the button's
`onClick` and the drag gesture's `onCommit` call), so what remained was narrower than building it
from scratch: recording the decision, and closing a real secondary gap the first reviewer round
had found but left open pending the parity question itself — the button already had
`disabled={revealState.kind === "loading"}`, which stops a second click from ever reaching
`handleCommit` while a reveal is in flight; the drag path had no equivalent.

**First attempt was wrong, caught on this row's own reviewer round.** Guarded inside
`handleCommit` itself (`if (direction === "right" && revealState.kind === "loading") { setDx(0);
return; }`) and called it closed. The reviewer ran a real-DOM probe rather than trusting the
mutation test's own green result and found the guard fires too late to do anything: `onCommit`
(and therefore `handleCommit`) only runs *after* the drag's exit animation has already finished —
`useSwipeGesture` writes the off-screen `translate3d(...)` transform straight to the DOM node via
`applyTransform`, a write `dx`/`setDx` never controlled in the first place. A blocked drag under
the first attempt therefore returned early, but the card was already stuck at its exit position
permanently — the deck didn't advance, nothing errored, and the adopter was left staring at an
empty-looking stack.

Chose instead (the actual fix): a new `canCommit?: (direction) => boolean` callback on
`SwipeGestureCallbacks` (`use-swipe-gesture.ts`), checked synchronously inside `onPointerUp`
*before* the exit animation starts — a decided commit whose `canCommit` returns `false` takes the
exact same path as an under-threshold drag (spring back to centre, `onSnapBack` fires, no exit
ever begins). `SwipeDeck.tsx` passes `canCommit: (direction) => !(direction === "right" &&
revealState.kind === "loading")`. `handleCommit` itself now carries no guard at all — with the
hook refusing the commit before it can start, `handleCommit` structurally cannot be reached with
`direction === "right"` while a reveal is loading (the button's own `disabled` prop closes the
other caller), so a guard there would have been dead code.
Alternatives: a separate guard duplicated on each caller — rejected, one predicate checked in the
one place both gestures fork from a decision is simpler than two copies that could drift.
Exposing a `resetPosition` method from the hook for `handleCommit` to call after the fact —
rejected, that still lets the exit animation run to completion first, so it would need to
interrupt a transition mid-flight rather than simply never starting one; `canCommit` avoids the
problem instead of patching around it.
Why this one: the earlier version's defect was structural (the guard was in the wrong place, not
merely missing a line), and reusing `useSwipeGesture`'s own spring-back path means a refused drag
looks and behaves identically to a drag that never crossed the commit threshold — no new visual
state to design or test separately.
Reversibility: trivial to revert `canCommit` itself; reverting the parity decision itself is
Oleksii's to make, not a code change judgement call.
Confidence: high — mutation-tested three times, independently, at three different layers: (1) the
hook's own guard (`decision.committed && canCommit` reverted to `decision.committed`) —
`use-swipe-gesture.test.tsx`'s new case failed with the exact predicted symptom (`onCommit` fired,
`onSnapBack` didn't, transform never reset), 31/32 other tests stayed green; (2) `SwipeDeck.tsx`'s
own wiring (the `canCommit` line deleted from the `useSwipeGesture(...)` call) —
`SwipeDeck.test.tsx`'s wiring test failed (`capturedCanCommit` stayed `null`), 19/20 others green;
(3) the same guard, mutated against a real running server and real seeded Postgres (a
compile-safe mutation this time — `decision.committed && (canCommit || true)` rather than
deleting the reference outright, since the naive deletion trips `next build`'s own
`noUnusedLocals` check before the test ever gets to run) —
`discovery-reveal.harness.ts`'s new end-to-end case failed with the deck advancing past the
second card ("Ніка" → "Зевс") instead of staying put. All three restored and reconfirmed green.
The harness case exists because a reviewer's own real-DOM probe, not a unit test, is what caught
the first attempt's defect — the same class of bug (a card visually stuck off-screen) has no
component-test-level signal at all if the guard is merely absent rather than present-but-wrong,
since jsdom does no layout and no real CSS transition timing.

**Corrected on a second reviewer round, after this row's mutation-testing above was already
written down**: the harness case's own reveal-request/deck-position/dialog-name assertions all
pass identically against the pre-fix `handleCommit`-only guard too — that version also blocked
`onSwipe` and a second `openReveal` call, just too late to undo the exit animation. Added the one
assertion that actually distinguishes the two: the refused card's own `style.transform`, read
directly, must equal `"translate3d(0, 0, 0) rotate(0deg)"` (centred) rather than staying at its
exit position. Also added: a `prefers-reduced-motion` unit-test variant of the `canCommit`
refusal (a distinct branch in `onPointerUp` — synchronous `onSnapBack`, no pending settle),
found missing on the same round.
Commit: 8ad4fab.

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

## Investigation and decision, 2026-09-13 — bot traffic burning Neon's transfer allowance

**Trigger:** Neon (project opika) showed 4.2 of 5 GB monthly public network transfer used since
Sep 2, 29.37 CU-hours of compute over 10 days, against a 33 MB corpus. Vercel Observability
showed ~100 req/min, flat and continuous over the visible 6h window, 33K of 37K requests to
`/tvaryny` alone, 0% cache hit on every app route. The site is noindexed
(`SITE_IS_PUBLICLY_DISCOVERABLE = false`), holds 220/320 fabricated animals, and no outreach has
happened — there is no legitimate source for this traffic.

**Investigated, reported findings-only first (Tier 1, no code changed until a decision came
back):**

1. **Who.** 89% of requests hit one route pattern (`/tvaryny`); Vercel's own automatic anomaly
   detection (Firewall Actions) fired only 0–4 times across 6h, so this isn't tripping Vercel's
   own bot heuristics. Could not identify the actual bot name or confirm one-URL-vs-enumeration
   from here — the Vercel plugin session's authenticated identity cannot see this project at all
   (`list_projects` empty, `get_project` 404s, `get_runtime_logs` 403s "does not exist or you do
   not have access" against `prj_TCW2TP0zhesnhKIgT8dQXbQfTPYG`) — reported as its own item, below.
2. **Is the rate limiter firing.** No. `apps/web/src/api/rate-limit.ts`'s in-memory `Map` is
   per-serverless-instance by its own documented design; Edge Requests' 4XX line was flat and
   near-zero the whole window, meaning no 429s were served at all — consistent with load spread
   across concurrent Fluid Compute instances (and/or many source IPs), each seeing well under
   100/min in its own private counter.
3. **What one request costs.** Measured directly against local Postgres seeded with the real
   320-row corpus (not guessed): one `/tvaryny` render is 3 DB round-trips (`gallery.list`'s page
   query ≈33KB JSON, a `COUNT(DISTINCT shelter_id)`, `cities.list` ≈1.3KB) ≈35KB of payload per
   render, all over `@neondatabase/serverless`'s HTTP driver — real "public network transfer" by
   construction, since this connection is never VPC-peered. Extrapolated flat across the full
   10-day billing window, 33K req/6h × ~35–40KB ≈ 48GB, roughly 10× the actual 4.2GB — the
   reconciled read is that the current rate has been running for roughly a day, not the full ten,
   which places its start near the robots.txt change (D-3) that dropped `Disallow: /`. Also
   surfaced in this pass: `packages/db/src/client.ts`'s own comment claiming the function region
   was unpinned and every request crossed the Atlantic was stale — `apps/web/vercel.json` has
   pinned `regions: ["fra1"]` since commit `f966242` (2026-09-09, merged the same day as the
   driver fix via PR #53 / squash commit `61183b2`) — production has run in Frankfurt, next to
   Neon, for four days already. Corrected in `client.ts`, `docs/build-plan.md`'s O-9 section, and
   this entry, same pass — the first two drafts of this entry repeated the same
   commit-attribution error a reviewer later caught (citing the PR's squash commit while quoting
   the actual commit's own message).
4. **Why 0% cached.** `force-dynamic` on `/tvaryny` and `/tvaryny/[animalId]` is deliberate and
   documented (avoids a build-time `DATABASE_URL` secret and a stale baked-in snapshot) — but
   there is *also* zero query-level caching on top of that (no `unstable_cache`, no `fetch`
   cache, no revalidate window anywhere in `gallery-repo.ts`/`city-repo.ts`/`server-client.ts`).
   Dynamic-by-design is a real, defended decision; zero caching on top of it is not the same
   decision and isn't defended anywhere.
5. **Does the build read the corpus.** No `generateStaticParams` on either route; `next build`
   never touches the database for these routes, previews or production.

**Decision — Oleksii's own words, 2026-09-12/13:** "implement Option A, the pre-launch gate."
Rationale, his own: "the 4.2 GB reconciles to roughly one day at the observed rate, not ten,
which places the start near the robots.txt change that dropped Disallow: / (D-3). The request
shape — 33K on /tvaryny, 28 on /tvaryny/[animalId] — is parameter enumeration of the gallery's
filter/sort/page query space, not content crawling. Every response already carries
X-Robots-Tag: noindex, nofollow, so whatever is doing this ignores what the site says;
politeness measures cannot reach it." Explicit instruction, also his own words: no user-agent
carve-out ("It is spoofable and it is a permanent hole for a ten-minute task"); the gate must not
interfere with `SITE_IS_PUBLICLY_DISCOVERABLE`'s other consequences, assert both states; a
mutation test must show removing the gate lets an unauthenticated request through; the gate comes
down in the same change that flips the flag, alongside D-7's banner. **This last clause — "alongside
D-7's banner" — was his own instruction at the time, and he withdrew it further down this entry: see
"Four further decisions" below, item covering the wording collision. Left here rather than edited
out, since this whole file's job is the instruction as actually given, not as later corrected.**

**Implemented:**
- `apps/web/src/api/prelaunch-gate.ts` — pure `evaluatePrelaunchGate(cookieHeader, queryValue,
  secret)`, timing-safe secret comparison (same technique as `session/token.ts`'s
  `hashesEqual`), `__Host-`-prefixed cookie in production (same pattern as
  `session/cookie.ts`), no `Max-Age` (session-scoped — this is a launch-gate window measured in
  weeks, not a credential worth persisting). 12 unit tests
  (`apps/web/src/api/prelaunch-gate.test.ts`), including a reviewer-found regression: `secretsEqual`
  originally compared string `.length` before calling `timingSafeEqual` on UTF-8 buffers, so a
  same-`.length` guess containing one multi-byte character crashed the check with a `RangeError`
  instead of being denied — any unauthenticated caller could trigger it. Fixed by comparing buffer
  length instead; mutation-confirmed (reverted, watched the new test fail with that exact
  `RangeError`, restored).
- `apps/web/src/proxy.ts` — while `SITE_IS_PUBLICLY_DISCOVERABLE` is false, every request 403s
  unless the gate cookie or the `?gate=` query parameter carries the secret (the latter mints
  the cookie on the response). Matcher widened from `/tvaryny*` only to the whole site
  (`/((?!_next/static|_next/image|favicon.ico).*)`) — "every request," per the decision, not
  only the routes a crawler happened to hit this time; `/api/rpc/*` is in scope now too. The
  pre-existing per-IP rate limiter is unchanged in behaviour, still scoped to `/tvaryny*` only,
  now inside a helper (`respectingRateLimit`) the gate calls into rather than being the whole
  function body. No user-agent branch anywhere in the file. 11 tests
  (`apps/web/src/proxy.test.ts`) assert both `SITE_IS_PUBLICLY_DISCOVERABLE` states — denial,
  cookie-allow, query-allow-and-mint, whole-site coverage (a non-`/tvaryny` route, the RPC
  route), no user-agent carve-out, and that a launched site never even reads
  `PRELAUNCH_GATE_SECRET`.
- `PRELAUNCH_GATE_SECRET` added to `apps/web/src/api/env.ts`'s `RequiredProductionEnvSchema`,
  boot-validated like `CURSOR_HMAC_SECRET` — documented there to come back out in the same
  change that removes the gate.
- **Mutation-tested**: reverted the gate's own denial check to a no-op
  (`if (false && decision.kind === "denied")`), re-ran `proxy.test.ts` — 5 of 11 tests went red
  with an unauthenticated request returning 200 instead of 403 (denial-by-default, the RPC
  route, the non-`/tvaryny` route, and the user-agent-carve-out check all caught it). Restored
  and reconfirmed green.
- **Playwright harness**: `next start` runs in production mode, so the harness's real server now
  403s every request the same way production does — no test-only bypass, on purpose, or the
  harness would stop covering the gate. Added a `setup` project
  (`test/harness/prelaunch-gate.setup.ts`) that opens the gate via a real navigation carrying
  `?gate=`, the same way an operator would, and saves the resulting cookie jar
  (`storageState`) for the `chromium` project (`dependencies: ["setup"]`) to reuse — no
  gate-specific code needed in any of the ~15 existing `.harness.ts` files. `PRELAUNCH_GATE_SECRET`
  added to the harness's `webServer.env`. Confirmed Playwright's own `webServer.url` readiness
  probe tolerates a 403 (`isURLAvailable` accepts any `2xx`–`403`, checked against
  `playwright-core`'s own source, not assumed). **Reviewer-found gap, second round**: every other
  harness file only proves the gate can be *opened* — none of them, `prelaunch-gate.setup.ts`
  included, ever proves the real server actually *denies* an unauthenticated caller. Added
  `test/harness/prelaunch-gate.harness.ts` — 4 tests against the plain `request` fixture (which,
  per `gallery-rate-limit.harness.ts`'s own finding, does not inherit `storageState`), covering:
  no gate value at all, a wrong query value, a route outside `/tvaryny`, and the correct query
  value succeeding. Run against the real server: all 4 pass.
- **Reviewer's second-round found the byte-length crash above (finding 1) was the only high-severity
  code defect; findings 3/4/6/7/8 (local-dev ergonomics, a stale `seo-flags.ts` cross-reference, an
  untested cookie-attribute branch, an imprecise "every request" claim around config-level
  redirects, and a commit-hash misattribution) were fixed the same round — `.env.example`,
  `seo-flags.ts`, `prelaunch-gate.test.ts`, `proxy.ts`'s `config` comment, and the two hash
  citations above, respectively.**
- `docs/build-plan.md`'s launch-gate section: the gate's removal is now written down as due in the
  same change that flips `SITE_IS_PUBLICLY_DISCOVERABLE` specifically — **not** simultaneous with
  D-7's banner removal, which a first draft of this row got wrong (a reviewer caught it): D-7 is
  explicit that the banner and the flag flip are deliberately *not* simultaneous. Raised to
  Oleksii rather than resolved unilaterally; **his answer, verbatim: "you are right and the
  instruction was wrong. D-7 deliberately separates the banner (removed at first real shelter
  onboarding) from the SITE_IS_PUBLICLY_DISCOVERABLE flip (launch). The gate correctly reads the
  FLAG."** Also his own words, verbatim, quoted here (`build-plan.md`'s own version paraphrases
  the same instruction into its own prose, deliberately reframed there — see the note below — not
  a second independent quotation): "during the window between them, a real shelter's data is
  live while the site is still not meant to be discoverable — that is precisely when the gate
  matters most" and, as two separate sentences, not one: "record that the gate link is how the
  first shelter is shown their own listing before launch. That is a feature of this design, not a
  workaround." **Note on `build-plan.md`'s own wording, found by a second reviewer round**: that
  section's first draft echoed "a real shelter's data is live" closely enough to read as "the
  gate protects real shelter data" — which contradicts decision 1 below (this is a shutter, not a
  security boundary) — and has since been reworded there to say what's actually true: nothing
  about that window is a data-exposure risk (`PublicShelterSchema`'s `pick`-based stripping
  already covers that, unrelated to this gate); what the gate actually saves in that window is
  the same bot noise and Neon cost this whole investigation was about, now potentially hitting a
  real row instead of a fabricated one. The in-memory rate limiter's own gate row is reclassified
  from "before real traffic (not urgent)" to a hard pre-launch blocker — today's traffic is the
  demonstration that it doesn't hold under real load, and a real launch (or any crawler let in
  after the flip) would reproduce it exactly.

**Four further decisions, Oleksii's own words, 2026-09-13, all "proceed on all of them":**
1. **Deploy order** — `PRELAUNCH_GATE_SECRET` set in Vercel on both Production and Preview before
   this branch deploys, same value on both. His reasoning, verbatim: "Preview is currently dead
   (no DATABASE_URL); gating it costs nothing now and covers the case where Preview later gets
   its own Neon branch." Also his instruction, verbatim: "this is a SHUTTER against bots, not a
   security boundary — what it covers is fabricated data. Do not let it be described as
   protecting anything." Recorded in `prelaunch-gate.ts`'s own top comment, `env.ts`, and here —
   not just here, since the code is what a future reader actually opens.
2. **Secret policy** — 32+ characters, `openssl rand -hex 32`, matching every other secret's
   convention. His reasoning, verbatim: "Not because the contents are valuable, but because a
   short gate is guessable by exactly the traffic it exists to stop." Boot-validated —
   `RequiredProductionEnvSchema`'s `PRELAUNCH_GATE_SECRET` entry is now `z.string().min(32, ...)`,
   not `min(1)`; two new `env.test.ts` cases pin the floor at exactly 32 (accepted) and 31
   (rejected).
3. **Transport** — accept the `?gate=` query parameter appearing in Vercel's request logs and
   browser history; no strip-redirect. His reasoning, verbatim: "the value guards fabricated
   data, it is short-lived, and the redirect would cost a rework of
   `gallery-rate-limit.harness.ts`'s request loop for no security gain." His instruction, also
   verbatim: "Record the reasoning in the code so it is not 'fixed' later by someone reading it
   as a leaked credential." Done — `prelaunch-gate.ts`'s `allowed_mint_cookie` variant carries
   this reasoning directly on the type.
4. Covered above (the D-7 wording collision).

**Reported to Oleksii as its own item, not folded into this decision:** the Vercel API access
failure (`list_projects` empty, `get_project` 404, `get_runtime_logs` 403 for `opika-web`) that
prevented answering "who" from this session — he will check whether the plugin's token and scope
actually cover this project.

**Still open, not blocking:** Bot Name and Paths tab screenshots, to be sent when convenient —
they settle whether caching `/tvaryny` (Option B) would help at all (a narrow set of repeated
filter/sort/page combinations is cacheable; a wide enumeration is not). Option B is not started
until that is known.

---

## R3 — the RATE_LIMITED sentence, PR #55's last blocker, closed

**His words, verbatim, sent in chat, 2026-09-13:** "Ви відкрили контакти багатьох притулків
сьогодні. Наступні — завтра." No surrounding instruction — the sentence itself was the whole
message. Confirmed by him, not assumed, that this was meant as the `RATE_LIMITED` copy (asked
directly rather than guessed, since the alternative reading — a new incident report about bot
traffic actually burning reveal budget in production — would have called for a completely
different response).

**Why this was the blocker in the first place:** `animals.reveal`'s own `RATE_LIMITED` — 30
distinct shelters revealed in 24h, `apps/web/src/api/reveal-rate-limit.ts` — rendered the generic
`uk.errors.loadFailed` ("Щось не спрацювало на нашому боці.") like every other reveal failure,
which is false in this state: it *is* a limit applied to the adopter, not a server malfunction.
Writing the honest replacement was never mine to do — see `CLAUDE.md`'s standing rule against
inventing Ukrainian copy, and this row's own PR body, which has said so since R3 first shipped.

**Implemented, using his two sentences exactly, nothing added:**
- `packages/i18n/src/messages/uk.ts` — new `errors.rateLimited = { title, body }`. No `eyebrow`,
  no `action`: neither was given, and this row exists specifically because inventing either would
  repeat the mistake the whole blocker was about.
- `apps/web/src/features/reveal/useReveal.ts` — `RevealState`'s `"error"` variant gains a
  `reason: "rateLimited" | "loadFailed"` discriminant (a discriminated union, not a boolean, per
  `docs/standing-constraints.md`). Detected with the same `isDefinedError(error) && error.code ===
  "RATE_LIMITED"` idiom `use-feed-deck.ts` already established for `INVALID_CURSOR` — `RATE_LIMITED`
  is one of `animals.reveal`'s declared contract errors, so a real response carrying it is
  `isDefinedError() === true`. A session-bootstrap failure (a different code path, checked first)
  is always `"loadFailed"` — that mechanism can't produce `RATE_LIMITED` at all.
- `apps/web/src/features/reveal/ContactRevealDialog.tsx` — `RevealError` picks
  `uk.errors.rateLimited` vs `uk.errors.loadFailed` off the new `reason`, and renders **no retry
  button** for the rate-limited case: retrying before the window resets cannot succeed, so
  offering one would be a false affordance. The eyebrow span is now conditional (`"eyebrow" in
  copy`) since `rateLimited` doesn't have one.
- `packages/i18n/src/messages/en.ts` — mirrored key-for-key, machine-translated like every other
  entry in that file (its own top comment: not production-facing, next-intl isn't wired until
  H3) — required by `messages.test.ts`'s uk/en key-shape parity check, not a second copy decision.

**Verified vs. asserted:**
- `useReveal.test.tsx`: 3 new tests — a `RATE_LIMITED` oRPC error (constructed with `new
  ORPCError("RATE_LIMITED", { defined: true })`, the same technique `use-feed-deck.test.tsx` uses
  for `INVALID_CURSOR`, since `defined: false` is the default and would test nothing) maps to
  `reason: "rateLimited"`; an undeclared server error and a failed session bootstrap both map to
  `"loadFailed"`.
- `RevealFlow.test.tsx`: one new **rendered** assertion (`docs/standing-constraints.md`: "a UI
  item may not be marked done on the basis of inspecting markup") — a mocked `RATE_LIMITED`
  response renders a dialog named exactly "Ви відкрили контакти багатьох притулків сьогодні.",
  shows "Наступні — завтра.", and has no `reveal-retry` button.
- **Mutation-tested**: forced the reason to always resolve `"loadFailed"` — both the new
  `useReveal.test.tsx` assertions and the new `RevealFlow.test.tsx` rendered assertion went red
  (the latter failed to find a dialog with the expected accessible name at all, since the
  generic copy rendered instead). Restored, confirmed byte-identical, reconfirmed green.
- No Playwright harness test: the reveal-rate-limit's own budget is 30 *distinct shelters*, and
  the seeded corpus has only 8 — a real end-to-end trigger of this exact condition is not
  reachable with current seed data. (Not the same situation as
  `discovery-reveal.harness.ts`'s own reveal tests, corrected on review: those use `page.route`
  only to delay a real `animals.reveal` request via `route.continue()`, to create a controllable
  race window — they never fabricate a response, so they're not a precedent for mocking a
  condition the seed data can't reach.) The component-level rendered test above is the form of
  verification `docs/standing-constraints.md`'s own wording accepts ("a component test **or** a
  harness run").

Full `pnpm check`: 896 workspace unit tests, 206 harness tests, all green.

**Two things a reviewer round surfaced, reported rather than silently absorbed or fixed:**

1. **"сьогодні… завтра" reads as a calendar-day reset; the mechanism is a rolling 24-hour window**
   (`reveal-rate-limit.ts`, counted from each individual reveal's own timestamp, not from
   midnight). If the oldest counted reveal was at 11:00 yesterday, a unit frees at 11:00 *today*,
   not at the next calendar day. Not a reason to change his wording unilaterally — the sentence
   under-promises rather than over-promises, and it's his call whether that's close enough or
   worth a revision. Flagged to him as its own item, not decided here.
2. **A real, adjacent gap found but deliberately not fixed in this change**: a genuine network
   failure during `animals.reveal` (no response reached at all — a `TypeError`, same signal
   `use-feed-deck.ts` already keys "offline" on) still falls through to `reason: "loadFailed"`
   here, rendering "Щось не спрацювало на нашому боці." for a case that isn't the app's fault at
   all — `uk.errors.offline` already exists and is approved copy for exactly this. Not fixed as
   part of this row: it's a distinct, pre-existing gap this change happens to sit next to, not
   something Oleksii asked to fix now, and folding it in here would make this diff about two
   things instead of one. Parked as its own follow-up, same shape as `use-feed-deck.ts`'s existing
   three-way branch (`TypeError` → offline, a specific code → its own reason, else → loadFailed).

**PR #55 comes out of draft in the same change** — this was the one thing keeping it there.

---

## PARKED

### R3 — `useReveal`'s "error" state still renders the generic copy for a genuine network failure
What's blocked: a real offline/network failure during `animals.reveal` (a `TypeError` — the fetch
never reached a server at all, the same signal `use-feed-deck.ts` already keys "offline" on) is
indistinguishable from any other reveal failure in `useReveal.ts` today — both resolve to
`reason: "loadFailed"`, rendering "Щось не спрацювало на нашому боці." ("something went wrong on
*our* side") for a case that is neither the app's fault nor the shelter's. `uk.errors.offline`
already exists, is already approved copy, and is already wired for exactly this signal in the
deck's own feed-loading error state (`SwipeDeck.tsx`'s `DeckErrorReason`) — this is the same gap,
one component over, found while adding `RevealErrorReason` for the RATE_LIMITED row and
deliberately not folded into that change (recorded there, not fixed there).
What's needed to unblock: extend `RevealErrorReason` to a third value (`"offline"`), branch
`useReveal.ts`'s error handling on `revealError instanceof TypeError` the same way
`use-feed-deck.ts:102-104` already does, and give `RevealError` (`ContactRevealDialog.tsx`) an
`"offline"` copy branch using the already-approved `uk.errors.offline`. No new Ukrainian needed —
purely wiring an existing, approved string to a signal that already exists.
Estimate once picked up: small — the pattern to copy already exists verbatim in a sibling file.

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

### O-14's composition choice (Phase K)
No mock exists for `/pro`/`/prytulkam`'s large-screen composition; two directions recorded in
`docs/observations.md`'s own O-14 entry, with a recommendation, for Oleksii to choose from.
