# Decisions pending Oleksii's review

Working log for the autonomous session started 2026-09-09, after PR #53 merged. Every
reversible judgement call made without asking goes here instead of blocking on an answer —
see `CLAUDE.md`'s working loop for the rule this implements. Newest entry last within each
section.

**Note on history:** R2 (`feat/deck-two-action`, PR #54) merged into `main` first — this file's
own R2 section below is folded in from that branch's copy, reconciled by hand as its own header
note said it would need to be. `feat/city-slugs` (Phase S, PR #56) is still open and still carries
its own separate copy of this file; expect the same reconciliation again when it merges.

## Summary — read this first

**Rows completed this session:** R2 (two-action deck, not-a-judgement notice's permanent home,
merged via PR #54) and Phase K (the polish batch, this branch).

**R2 — merged.** `feat/deck-two-action` → `main` via PR #54. Two reviewer rounds (PASS WITH NOTES
both), all findings addressed, `pnpm check` green.

**R2 decisions needing your eye, ranked by cost to reverse:**
1. **[trivial to reverse] Notice hidden below 360px width, not shown everywhere.** See
   `R2 — notice geometry` below. A CSS class change; reversible in minutes if you'd rather see
   it smaller-but-present at 320 instead of absent.
2. **[trivial to reverse] Notice moved off the detail page entirely, not duplicated.** See
   `R2 — notice moved, not duplicated` below. Re-adding it there is a few lines if you disagree
   with the reasoning.
3. **[moderate to reverse — touches a harness assertion's own number] PHONE frame's exact photo
   height assertion repointed 396→386.** See `R2 — photo height assertion` below. Reversing
   means finding another 10px of vertical budget instead.

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
Commit: (pending — see PR)

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
Commit: (pending — see PR)

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
Commit: (pending — see PR)

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

---

## PARKED

**O-14's composition choice** (Phase K) — no mock exists for `/pro`/`/prytulkam`'s large-screen
composition; two directions recorded in `docs/observations.md`'s own O-14 entry, with a
recommendation, for Oleksii to choose from.
