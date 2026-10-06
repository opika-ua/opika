# Observations

Oleksii's running list of things he wants changed, plus the decisions he has already made about
some of them.

## How to handle this file

- Entries marked `open` are **filed, not scheduled**. Do not fix them, do not ask clarifying
  questions about them, do not fold them into the current plan row.
- Entries marked `decided` carry Oleksii's decision. Implement them only when the plan schedules
  them, or when an entry explicitly says otherwise.
- Entries marked `DIAGNOSE NOW` are the exception: measure them immediately, report findings,
  and do not fix or redesign anything until Oleksii has seen the numbers.
- Before starting any plan row that would build substantially on a surface with an open
  observation against it, say so and let Oleksii decide whether to reorder. Do not decide that
  yourself.
- Class: `bug` = behaviour is wrong. `design` = behaviour is correct, presentation is not.
  `decision` = needs Oleksii to choose before anything is built.

## Scheduling

**Done — diagnosis, 2026-09-05:** O-9, O-15 measured and reported; O-16 resolved as a
consequence. See each entry below and **Decisions 1 & 2** for what Oleksii decided once the
numbers were in.

**Inside Phase D, because the work touches them anyway:** O-3 (D-2 would otherwise write copy
for a component being deleted).

**Its own row set, scheduled after Phase D finishes, not folded into it:** the device-scoped
skip + two-action deck + inline reveal sheet (Decisions 1 & 2). This is an unbuilt feature on
the product's namesake surface, not a fix — see "Decisions" below.

**Its own row, after Phase D and before the MVP gate:** the `packages/db/src/client.ts`
connection-strategy change implied by O-9's findings. Not a mid-D patch.

**After the MVP gate, as a redesign pass:** everything else.

---

## O-1 — Header is a text wordmark, no logo · design · done (PR #57, 2026-09-10)

No logo in the header; the wordmark is plain text. A logo exists in the Claude Design export.

Check the design export for what was specified before assuming a logo belongs there — the
«Реєстр» system may have chosen a wordmark deliberately. If it did, this is a change of
decision, not a defect, and should be recorded as such.

**Done — Phase K (`feat/polish-batch`, PR #57).** Logo mark added to the header. Full detail:
`docs/decisions-pending-review.md`'s Phase K entries, `docs/build-plan.md`'s own Phase K row.

## O-2 — The deck is offered on desktop · decision · DECIDED

**Decision: hide the deck entry above a breakpoint.** Desktop gets the list only; the deck stays
a mobile surface. Do not design a desktop deck.

This does not relax any DECK work: the deck still exists at 320/360/390 and still needs the
compact banner variant and the geometry invariant. Nothing about the height budget changes.

**Unblocked** — O-15 is diagnosed and resolved via Decision 2. Still not before the deck feature
row set (device-scoped skip, two-action deck, inline reveal) is built — presenting a surface
correctly is pointless while its actions are being rewired underneath it.

## O-3 — The gallery intro band is redundant · design · DECIDED

«Тварини з перевірених притулків Київщини…» plus the sub-line plus a row of city pills sat above
the listing on /tvaryny, duplicating the left filter rail and delaying the content.

**Decision: remove the band from the page entirely.** The filter rail and «Знайдено 220 тварин»
carry orientation. `uk.firstRun.promise` survives as `og:description` only.

**Do this as part of D-2, not as a later row.** D-2 would otherwise write a careful demo-mode
copy swap for a component that is being deleted, and test its rendering on five surfaces.
Deleting it first makes D-2 smaller. The demo-mode swap of the string still happens — a link
preview must not claim verified shelters that do not exist — but there is no on-page rendering
left to reason about.

If removing the band turns out to touch more than FirstRunBand and its tests, stop and report.

**Done, 2026-09-05 — it did touch one thing beyond FirstRunBand and its tests, reporting per
the line above.** `uk.firstRun.disclaimer` («Без реєстрації. Ми не беремо і не переказуємо
грошей. «Не зараз» — це просто фільтр, а не оцінка тварини.») was only ever rendered inside the
band, and per this entry's own instruction ("`uk.firstRun.promise` survives... only") nothing
said the disclaimer should survive elsewhere — so it was deleted from both locale catalogues
(parity-tested). Consequence: `docs/copy-and-ia-critique.md`'s D5 had recorded this sentence as
carrying 2 of the 4 adopter-facing promises a first-time visitor sees **without clicking
anything**. The "no money handled" half is still reachable — restated on `/pro`, linked from the
site header on every page since Phase T. **The "«Не зараз» is a filter, not a judgement" half
was unstated for a time** — resolved by Oleksii's Phase D decisions (the not-a-judgement notice
— not build-plan.md's D-3 row, an unrelated robots-metadata task): interim home was the detail
page, directly under the not-now/reveal action pair (`AnimalDetailScreen.tsx`,
`uk.actions.notAJudgementNotice`). `docs/copy-and-ia-critique.md`'s D5/E6 sections are annotated
as superseded rather than left to read as still-current advice against exactly what was done.

**Moved to its permanent home, 2026-09-09 (Phase R, R2, `docs/build-plan.md`):** the notice now
lives in the deck (`SwipeDeck.tsx`), directly under the action row, and no longer renders on the
detail page at all. **Narrowed, not fully restored:** the deck hides it below 360px width
(`NARROW_PHONE`/320 — a real measured shelter-line clip, not a style choice, see
`SwipeDeck.tsx`'s own comment), so this promise is currently stated nowhere on the product for a
visitor at that one width; it is stated at every width at or above 360 (`ANDROID_PHONE`, this
product's actual stated target audience — `docs/stack-decision.md`). Recorded here per "a
narrowed commitment is recorded as narrowed, not as satisfied"
(`docs/standing-constraints.md`) — no new copy involved, so no gate.

**Done, 2026-09-06 — all three D-2 strings landed, nothing renders a marker anywhere.**
`uk.demo.bannerNotice`, `uk.demo.deckLabel`, and `uk.actions.notAJudgementNotice` all have real
Ukrainian (`copy-status.test.ts` confirms zero placeholders across all three), with English
counterparts in `en.ts`. The disclaimer was confirmed to be a single string (not two keys)
before writing anything, per Oleksii's stated condition for that check.

**Correction, 2026-09-06 — provenance, caught by `opika-reviewer`'s STOP on this same row.**
The paragraph above originally read as if all three strings, including the edit dropping
«просто» from the recovered notice, were Oleksii's own wording. They were not, and the review
was right to stop on it. Corrected, on Oleksii's own account:

- `uk.demo.bannerNotice` and `uk.demo.deckLabel` (named `promise`/`bannerNotice` until a second
  rename below) — **drafted by Claude from an English sense; Oleksii selected these from
  offered options on 2026-09-05.**
- `uk.actions.notAJudgementNotice` — **the «просто» cut was Claude's unapproved edit, not
  Oleksii's instruction, and it is reverted.** The notice now ships exactly as the original
  `firstRun.disclaimer`'s third clause read: «Не зараз» — це просто фільтр, а не оцінка
  тварини. This is already Oleksii's shipped copy, reproduced verbatim — recovering it exactly
  needs no fresh approval, which is precisely why reverting the edit was the right fix rather
  than seeking approval for the edited version.

Every test and doc comment asserting the edited (просто-less) string, or misstating either
string's provenance, has been corrected alongside this entry — `uk.ts`, `en.ts`,
`copy-status.test.ts`, `animal-detail.harness.ts`, `AnimalDetailScreen.tsx`,
`docs/design/README.md`, `docs/copy-and-ia-critique.md`, `docs/build-plan.md`.

**Renamed, 2026-09-06 (PR #53 review):** the keys `demo.promise` and `demo.bannerNotice`
described each other's contents, not their own — `promise` (mirroring `firstRun.promise` by
habit) actually held the sentence shown in a shared link's preview *banner*, and `bannerNotice`
actually held the deck's short *label*. Renamed to `demo.bannerNotice` (the banner sentence) and
`demo.deckLabel` (the deck label) so each name describes what it holds.

**Amendment to the D2 decision on `og:description`, scoped (Option B, 2026-09-06 — PR #53
review):** the original decision omitted `description`/`openGraph.description` entirely rather
than render `[COPY PENDING]` — a fallback for having no honest string. `uk.demo.bannerNotice` is
real now, so the root layout defaults to it as the description while
`REGISTRY_HAS_NO_REAL_SHELTERS` — **but this is a default, not a blanket rule.** An earlier pass
had every route use it, `/prytulkam` and `/pro` included, without either page's inclusion ever
being confirmed as intentional — the same unattributed-decision problem as the wording
correction above, one level up. Oleksii scoped it: `/prytulkam` and `/pro` override the root
default with their own existing opening sentences (`uk.forShelters.whatThisIs`,
`uk.about.intro`, both verbatim, no new keys, no trimming) — this disclosure was never meant to
reach those two specifically, only the surfaces that actually show fabricated data.
`DeckScreen.tsx`'s `pendingCopyKeys`-based fallback (built for the same reason, before
`deckLabel` had real text) is likewise removed — both keys are simple, direct catalogue
references now.

The previously-open question — whether the detail-page notice rendering a marker live and
ungated was consistent with the banner/preview's "withhold while pending" treatment — is now
moot: nothing is pending anywhere. Also flagged and still true, separately: `CLAUDE.md`'s
commitments table says `forShelters.*` "currently holds `COPY_PENDING` placeholders", which
`copy-status.test.ts` shows is stale (`pendingCopyKeys(uk.forShelters)` returns `[]`) —
unrelated to D-2, worth a correction whenever someone next touches that table.

**Note for whoever next reuses the money half of the deleted disclaimer** («Ми не беремо і не
переказуємо грошей») **— Oleksii's instruction, not yet actioned because nothing currently
reuses it:** its «ми» must take the all-«я» treatment (registry voice, per the person/voice
split already recorded — see `/prytulkam`'s `money` key, which already frames this fact as the
registry's own action rather than "we"). Do not carry «ми» forward unchanged into a new
placement.

## O-4 — Filter label to pill spacing too tight · design · checked, not a defect (2026-09-10)

The gap between «МІСТО» / «ВИД» / «РОЗМІР» / «ВІК» and the pills below is visually too small.

Open the mock before changing anything. Either the implementation drifted from the design
system's spacing token, or the mock itself is tight — different fixes, and the design doc is the
authority.

**Checked, not assumed — the mock itself specifies 12px.** `Opika Registry System.dc.html`'s own
computed styles for each label+chip-row group are `display: flex; flex-direction: column; gap:
12px` (both the B1 rail frame and its sheet equivalent). `FilterRail.tsx` and `FilterSheet.tsx`
already render exactly `gap-3` (12px) for this same grouping — this is the second half of O-4's
own instruction: "or the mock itself is tight." It is. The implementation has not drifted from
the design system; the design system's own stated number is what reads as tight. **Not changed**
— widening it would be a real design deviation (a spacing-token change), not a bug fix, and
needs Oleksii's sign-off the way any other override of a mock-specified value would, not a
default assumption that "looks tight" always means "implementation error."

## O-5 — Card grid does not use the width of large screens · decision · DECIDED

At 2560px the grid renders four columns and stops, leaving a large empty region to the right.

**Decision: more columns above a breakpoint.** The grid gains columns on wide viewports and uses
the screen. Prose containers stay capped — grids and prose now have different rules.

⚠ **This re-creates F-1's exact preconditions.** F-1 was the gallery card declaring
`sizes="100vw"` for a 304px box, so phones fetched `detail.webp` (284 KB) instead of `card.webp`
(136 KB). Changing the column count changes the rendered card box at every breakpoint, which
invalidates every clause of the `sizes` attribute. Recompute `sizes` from measured box widths at
each breakpoint, and assert the variant that is actually fetched — not the attribute string. Do
not port the existing clauses forward.

Amend the container decision in `docs/design/README.md`. The 960/1320 reasoning is what
currently caps the grid; code and doc must not diverge.

## O-6 — City filter URLs expose UUIDs · design · open

`opika.org.ua/tvaryny?misto=c1000000-0000-4000-8000-000000000001`

Unreadable when shared, meaningless to a recipient, and bad for search. Cities need a stable
public slug (`?misto=brovary`) — a slug column, a lookup, and a redirect from the id form for
links already in the wild.

**Pairs with O-12** — same missing thing. Schedule as one row, never two.

## O-7 — The no-match explainer is confusing · design · done (2026-10-04)

«Немає фільтра "тільки свіжі картки". Тварина, про яку давно не писали, все одно чекає.»

Oleksii's call, and it settles an older disagreement: the copy critique wanted this cut, that was
overruled because the sentence is verbatim mock copy (`Opika Registry System.dc.html:275`) and
the mock is authority absent a decision from Oleksii. He has now made the decision.

Record it as a design-system change, not a bug — the mock and the code must not silently
diverge.

**Done — kept as shipped, recorded as a design-system change, not fixed as a bug.** Checked
before touching anything: the mock's own text (`Opika Registry System.dc.html:275`) actually
reads "Фільтра свіжості немає. Тварина, про яку давно не писали, все одно чекає." — close to, but
not byte-identical with, what shipped (`filters.railFooter`, `packages/i18n/src/messages/uk.ts`).
That's the real divergence this entry's own closing line warned about, and it's resolved in the
design doc's favour of the code, not the other way around: `docs/copy-and-ia-critique.md`'s D1
independently reviewed the *shipped* wording and called it "worth keeping as the model" (clearer
about what's actually missing than the mock's draft phrasing, and aimed at an adopter's real
worry rather than narrating the interface's own design). `docs/design/README.md`'s own quote of
this sentence is corrected to the shipped wording, with the reasoning recorded there so a future
pass doesn't read the mismatch as an oversight and "fix" the code back to the mock's rougher
draft. No code change — the sentence that shipped was already right.

## O-8 — Detail page breadcrumb lives in the header · design · done (PR #57, 2026-09-10)

«← Усі тварини у Бровари» renders inside the site header beside the wordmark, where it reads as a
navigation item. It belongs below the header, above the content, left-aligned.

Moving it out of the header is the direction README:589 ("never two navigations at once") points
anyway.

**Done — Phase K (`feat/polish-batch`, PR #57).** Moved below the header, left-aligned, above the
content. Full detail: `docs/decisions-pending-review.md`'s Phase K entries,
`docs/build-plan.md`'s own Phase K row.

## O-9 — «Написати притулку» takes seconds to respond · BUG · CONNECTION HYPOTHESIS (2026-09-05)

Clicking the primary contact action on the detail page shows nothing for several seconds before
the contact appears. This is the primary conversion action on the site.

**Not the same bug as O-15.** Traced both client paths **at the time of this entry**: the detail
page's `RevealFlow.tsx` really does call `session.bootstrap` then `animals.reveal`
(`revealBrowserClient`, `apps/web/src/api/browser-client.ts:42-45`); the deck's
`feedBrowserClient` (`browser-client.ts:23-25`) exposed only `feed.list` and could not reach
either procedure. One was a slow real call, the other never attempted a call. See O-15 for that
half. **Stale as of R3 (Phase R, `docs/build-plan.md`, 2026-09-09):** the deck now has its own
reveal too (`SwipeDeck.tsx`, sharing `revealBrowserClient` via
`apps/web/src/features/reveal/useReveal.ts`) — this diagnosis's "one never attempts a call" half
no longer holds, though the underlying connection-latency finding this row is actually about is
unaffected.

**Measurements taken (read-only, no scripted mutating calls against production per Oleksii's
instruction — he will time the actual click himself and paste the Network waterfall):**

- Repeated GETs to DB-backed production pages never drop below a floor even when hit
  back-to-back (`/tvaryny` 4.33s → 1.14s → 0.98s → 1.09s; `/tvaryny/[id]` 0.89–0.93s across four
  attempts). A one-time Neon-suspend cold start predicts a big first hit then a low floor — this
  is not that shape. Non-DB pages (`/prytulkam`, `/`) do show that shape: 0.40s → 0.10s, and stay
  near 0.10s.
- Same pages against a **local** Postgres (zero network distance) are far faster and don't carry
  that floor: `/tvaryny/[id]` 127–150ms warm, vs. 850–930ms for the identical code against
  production. Most of production's per-page cost is not the query logic — the code is identical.
- **The decisive test, run against production, both warm, both read-only:** `gallery.relaxationCounts`
  (one query — a conditional-aggregate scan) timed 420–430ms warm; `feed.list` (two sequential
  queries — keyset feed + a batched shelter lookup) timed 227–334ms warm, i.e. **faster**, not
  ~2× slower. Query *count* does not explain the gap; if anything the one-query endpoint's own
  query is heavier (a scan vs. two indexed lookups). This is evidence against "more queries ⇒
  proportionally slower," not proof — the two endpoints don't do equivalent work.
- **No Vercel function region is pinned anywhere in the repo** (`apps/web/vercel.json` sets only
  `framework`; no `regions` field; no route sets `preferredRegion`). Production's own
  `X-Vercel-Id` header on a real request read `arn1::iad1::…` — the function executed in `iad1`
  (US East). Neon is `aws-eu-central-1` (Frankfurt, per `docs/stack-decision.md:145`, which also
  names Neon's own answer to this: "PgBouncer + an HTTP serverless driver"). Every DB round trip
  today crosses the Atlantic. `packages/db/src/client.ts` uses the plain TCP driver
  (`postgres`/postgres-js) over that gap, not Neon's pooled/HTTP path.
- **A structural multiplier specific to the reveal flow, independent of the driver question:**
  `RevealFlow.tsx` awaits `session.bootstrap` and then `animals.reveal` as two **separate**
  browser→Vercel round trips, not one. Each is its own function invocation paying its own
  connection/query cost; `animals.reveal` itself then does four sequential queries internally
  (animal lookup, shelter lookup, idempotency check, rate-limit count, insert). The costs stack:
  two invocations × (connection cost + query cost), not one.

**Working hypothesis, not confirmed:** the ~1s floor on every DB-touching request is consistent
with a fresh TCP+TLS connection to Neon being paid on close to every invocation (Vercel doesn't
reliably reuse instances at this traffic volume, so `db.ts`'s module-level `cachedDb` rarely gets
to help) compounded by the US↔EU distance, and the reveal flow's own two-round-trip shape on top
of that. Still needs Oleksii's actual click-and-paste-the-waterfall to separate
`session.bootstrap`'s cost from `animals.reveal`'s.

**Scheduled:** the `packages/db/src/client.ts` connection-strategy change this points toward is
its **own row, after Phase D and before the MVP gate** — not a mid-D patch.

## O-10 — Detail page has no photo gallery · design · done (2026-10-06)

Only the primary photo is viewable at size. The others are small thumbnails that cannot really be
seen, and on large screens they waste the available space. Wants a slider or comparable.

**Pairs with C6** (detail-carousel crop against real source aspect ratios), which is already open
and waiting on real photographs from D-6. Same component, same session — do not do them
separately.

**Done, together with C6 and D-6** (`feat/d-6-detail-photo-gallery`) — `DetailPhotoGallery.tsx`
is a client-side gallery capped at the mock's own 3-photo count, with a thumbnail strip (desktop)
and dot indicator (mobile) that both let a visitor pick which of the 3 is shown at size, rather
than only ever seeing `photos[0]`. Built from the mock file directly after an earlier version
built from the design doc's prose got the shape wrong — see O-22, below, for the mock-reading
finding that round of review turned up.

## O-11 — No footer · design · done (PR #57, 2026-09-10)

No footer anywhere. Nowhere for secondary links, and nowhere for credits.

**Related to O-13** — the footer is the natural home for the font attribution.

**Done — Phase K (`feat/polish-batch`, PR #57).** Shared `Footer` component added, carrying both
site-nav links (`uk.nav.forShelters`, `uk.nav.about`) and the font credit, self-link-avoided per
the page it renders on. Full detail: `docs/decisions-pending-review.md`'s "Phase K — footer
content" entry, `docs/build-plan.md`'s own Phase K row.

## O-12 — The back link does not restore the filter · BUG · open

«← Усі тварини у Бровари» on a detail page returns to the unfiltered gallery, not to Brovary. The
link's text makes a claim the navigation does not honour — worse than a layout issue, because the
user is told something untrue.

**Pairs with O-6** — once cities have slugs, the filter is expressible in the return URL.

## O-13 — Font attribution placement · design · done (PR #57, 2026-09-10)

«Шрифт e-Ukraine — Міністерство цифрової трансформації України … CC BY 4.0» sits where it is
visually intrusive.

The attribution is required — CC BY 4.0 obliges it and removing it is not an option. Placement is
not prescribed: the licence asks for attribution in a manner reasonable to the medium, and a
credits line in a footer or on /pro is normal web practice. Keep the text, move it to a single
credits location (footer per O-11, or /pro), and keep the information intact — typeface name,
author, source, licence.

Not legal advice; if exact wording ever matters, read the licence deed directly.

**Done — Phase K (`feat/polish-batch`, PR #57).** Attribution moved into the new shared footer
(O-11), text unchanged. Full detail: `docs/decisions-pending-review.md`'s Phase K entries,
`docs/build-plan.md`'s own Phase K row.

## O-14 — Informative pages feel too narrow on large screens · decision · DECIDED

/pro and /prytulkam use a narrow centred text column that looks lost on a 2K monitor.

**Decision: keep the measure, fix the composition.** The ~65-character line length is deliberate
and widening it makes long-form text harder to read. What changes is the page around it — the
column stops being alone on an empty field.

Schedule after the MVP gate. **Reprioritised into the Phase K polish batch, 2026-09-06,
superseding this schedule note** (`docs/build-plan.md`).

**Parked, 2026-09-10 — the *what*, not the *whether*.** The footer half is done (O-11/O-13's
shared `Footer` now renders on both pages, which is already a small step toward "not alone on an
empty field"). The rest is a genuine composition choice with no mock to open —
`docs/design/README.md` has no section for either page at all, confirmed by grep, and
`/prytulkam`'s own file comment already records "the first surface in the project the design
handoff does not describe at all." `docs/standing-constraints.md`'s "ambiguous design with no
mock" is on the working loop's own stop-and-ask list regardless of what a reviewer says, and this
qualifies: there is a real aesthetic decision here (how to fill the field), not a mechanical one.
Two concrete directions, for Oleksii to choose between rather than one picked silently:
(a) place the existing 640px column inside a wider (e.g. 1200px) shell, left-aligned, with a
large low-opacity rendering of O-1's new logo mark filling the remaining space at desktop widths
— reuses an asset already built this batch, adds no new copy; (b) leave the column centred and
instead treat the empty sides as a deliberate colour-field (matching the "no colour in the
interface... all colour comes from photographs" design principle would mean this stays
monochrome too, so this option is closer to "no visual change, argue the empty field is fine
once a footer anchors the bottom" than a real second option). Recommend (a) if a decision is
wanted without a live conversation, since it is the more complete answer to "the column stops
being alone" — but this is a preference, not a default to act on unasked.

## O-15 — Deck actions have no effect · BUG · DIAGNOSED, RESOLVED BY DECISION 1 (2026-09-05)

Oleksii reported that «Написати» produces nothing at all, and asked whether skips have any
lasting consequence.

**Findings, traced in code** (no browser access this session; confirmed structurally, not by
clicking):

1. **The card does advance.** Drag (`use-swipe-gesture.ts`) attaches real `pointerdown`/
   `pointermove`/`pointerup` listeners, calls `setPointerCapture`, writes `transform` directly to
   the node, and commits on release. Both buttons (`SwipeDeck.tsx`) call a real `handleCommit`.
   Downstream, `use-feed-deck.ts`'s `onSwipe` pops `cards[0]` unconditionally — this part isn't
   broken.
2. **«Написати» invokes nothing.** It calls `handleCommit("right")`, the *identical* handler a
   skip calls — same effect, advance the stack, nothing else. It structurally cannot reach
   `animals.reveal`: the deck's browser client (`feedBrowserClient`) exposes only `feed.list`
   (`browser-client.ts:23-25`). Not a misfire — there was never a call to misfire.
   **Stale as of R3 (Phase R, `docs/build-plan.md`, 2026-09-09):** «Написати» now does reveal —
   `SwipeDeck.tsx`'s `handleCommit("right")` opens the deck's own reveal
   (`apps/web/src/features/reveal/useReveal.ts`, sharing `revealBrowserClient`) alongside the
   swipe it already recorded (R1). This item's own diagnosis was correct at the time; it just
   describes a state the product has since moved past.
3. **Nothing is persisted.** `swipes.record` has a real handler and repository server-side, but no
   surface in the app calls it — not the deck (`onSwipe` discards both its arguments), not the
   detail page (which has its own comment declining to, on the grounds that `swipes.record` is
   "deck-scoped"). It's dead code from the client's perspective today.
4. **`scoreAnimal`'s preference term reads nothing from `swipes`.** It compares the animal only
   against the adopter's explicit filter selections (`packages/domain/src/discovery/scoring.ts`),
   and is a documented constant today because filters are already hard query constraints. The
   0.2 weight doesn't currently discriminate between candidates at all.

**Resolved by Decision 1, below** — skips now persist (device-scoped, deck-only), and by explicit
choice do *not* feed `scoreAnimal`.

## O-16 — The deck's action set is redundant · design · RESOLVED BY DECISION 2

«Далі» does the same thing as «Не зараз» in the built code (`handleCommit("left")` both times,
confirmed under O-15) — this was O-15's bug wearing a design costume, not two actions that were
ever meant to differ; nothing in the design docs (`docs/design/README.md`'s deck section, buttons
`«Не зараз» · «↓» · «Написати»`) explains a distinct meaning for the middle button beyond layout.
**Decision 2 drops it.** Nothing further to design.

## O-17 — A test importing the same constant its component renders · tooling · filed, not scheduled

Filed by Oleksii, 2026-09-06, after the D-2 provenance STOP surfaced a fifth instance of this
exact defect family (a test file importing a string/constant from the same module the component
under test renders, then asserting equality against that import — which passes against any
value, including an empty one, because the test never transcribes the real content). Reviewer
vigilance keeps catching individual instances; that is not a mechanism, it is luck.

**Wants:** a lint rule that fails when a test file imports a constant also imported (directly or
transitively) by the component/module it is testing, then uses that same imported binding inside
an `expect(...)`/`toHaveText(...)`/`toBe(...)` assertion. Scope and exact detection strategy not
decided — this is filed, not designed. Do not build it now.

---

## O-18 — The gallery card's `sizes` attribute overstates the box in a fluid sub-range · tooling · found, not fixed

Found 2026-09-10 while adding O-5's ultrawide bracket and its own harness case. `AnimalCard.tsx`'s
`PHOTO_SIZES` declares a single flat px value for each bracket at and above 1024px width (280 for
desktop, 288 for wide and ultrawide) — correct once the grid's own container has actually reached
its max-width ceiling (960 / 1320 / 1992 respectively), which only happens once the viewport
clears roughly `ceiling + 432` (the rail, its gap, and page padding). Below that point in each
bracket the grid is genuinely fluid and the real photo box is narrower than the flat value
declares — an overstatement, the same class of defect F-1 and H1 already found and fixed
elsewhere, just in a sub-range no existing harness viewport happens to probe.

**Confirmed, not assumed:** a probe at 2200px (inside the new ultrawide bracket's own fluid
sub-range, 2000–2424px) measured a real photo box of 250.66px against a declared 288px — a
37px overstatement. The desktop bracket (1024–1439) has the analogous gap below ~1392px and has
*never* been measured by `gallery-photo-sizes.harness.ts` at any viewport at all (no case in that
file's `CASES` list uses the plain `DESKTOP` viewport for the gallery surface). The wide bracket
(1440–1999) has the same gap below ~1752px, also unmeasured — its own existing case only ever
probes 1920px, past the point where the cap binds.

**Not fixed here**, deliberately: a correct fix needs a real fluid `sizes` clause per bracket
(a `calc()` expression in vw units, one per column count — e.g. wide's fluid zone is
`calc(25vw - 150px)`, ultrawide's is `calc(16.6667vw - 116px)`, both derived from the same
column-width arithmetic `AnimalCard.tsx`'s own comment already uses, just solved for a variable
viewport instead of a fixed one), verified with a new harness case *inside* each fluid sub-range,
for every bracket including the desktop one that was never covered from the start. That is
real, separate scope — a `sizes`-attribute precision pass across the whole grid, not an O-5
extension — and no user-visible symptom currently exists for it (the practical cost is bandwidth
on a viewport width few real visitors sit at exactly, the same "invisible until measured" shape
F-1/H1 both had, just smaller in absolute px terms here). O-5's own new ultrawide case was moved
to the cap-reached 2560px viewport instead, matching the existing (if similarly incomplete)
pattern the wide bracket's own 1920px case already set.

---

## O-19 — The 48px touch-target floor is enforced by reviewer attention, not by a test mechanism · tooling · partially resolved 2026-09-12

Filed by Oleksii, 2026-09-10, after PR #57's `Footer.tsx` shipped both its links at 18px against
`docs/design/README.md:200`'s 48px minimum — caught by the `opika-reviewer` subagent, not by any
test, on a project whose own standing constraints say a defect a reviewer catches instead of a
test is a defect the test suite doesn't actually guard.

**Checked, not assumed, at filing time:** the assertion existed — `MIN_TOUCH_TARGET_PX = 48` —
as four independent copies (`discovery-layout.harness.ts`, `gallery-filters.harness.ts`,
`site-header.harness.ts`, and `gallery-pagination.harness.ts`'s own `MIN_TARGET_PX = 56`, found
only on a second reviewer round when the first pass at fixing this only replaced the three
sharing the exact 48px value), each applied by hand to whichever specific elements that file's
author remembered to write a case for. A new component (`Footer.tsx`) shipping under the floor
did not fail any existing test, because no existing test's scope included it — the mechanism was
"whoever writes a harness file remembers to add a case," which is exactly reviewer-attention
dressed as a test suite.

**Partially resolved, 2026-09-12 — the helper landed, the sweep did not.**
`expectMinTouchTarget(locator, label, minPx?)` (`apps/web/test/harness/harness.ts`) is now the
one shared mechanism all four files' existing cases call, checking both height *and* width (the
first version checked height only — a real gap the same reviewer round caught: a 48-tall,
20-wide element would have passed) against a floor that defaults to 48 and can be overridden per
component (pagination passes its own 56). This closes "one hand-copied assertion becomes three
different constants and three different bugs" — it does **not** close the actual gap this row
exists to describe: a page-wide sweep that catches a *future* Footer-shaped miss automatically,
without anyone writing a per-element case for it by name. That remains filed, not designed —
see below, unchanged.

**Still wants** — the shared-helper half above is done; this is the half that isn't: a page-wide
sweep over every `getByRole("link")`/`getByRole("button")` result (or an equivalent walk of the
accessibility tree) that runs per user-facing surface and checks *all* of that surface's
interactive elements against the floor, rather than the hand-picked subset each file's own
author thought to write a case for — so a new button or link is covered the moment it exists,
not the next time someone happens to write a test for it by name. Scope and exact sweep strategy
still not decided — this remains filed, not designed. Do not build it now.

---

## O-20 — `ORPCError` codes carried no HTTP status mapping · tooling · done (PR #60, 2026-09-11)

Filed during the reveal-budget row (PR #58): `RATE_LIMITED` and every other `ORPCError` code
answered a bare HTTP `500` on the wire, regardless of what the code actually meant — a client
checking the real status (rather than decoding the error body) could not tell a rate limit from
a genuine server fault.

**Done — `apiErrors`** (`packages/contracts/src/errors.ts`) **now declares a real HTTP status per
code**; every handler constructs its error via oRPC's own injected `errors.CODE()` rather than a
raw `new ORPCError(code)`, which is what makes the status mapping actually reach the response
instead of being documentation nobody reads at the call site. Reviewer found a real coverage gap
on first pass (`ANIMAL_NOT_AVAILABLE` and `SHELTER_NOT_VISIBLE` had no test at any status) —
fixed, two new cases added to `api.test.ts`'s `reveal` describe block. Full detail: the
"Fixed, 2026-09-12" paragraph in `docs/decisions-pending-review.md`'s Summary section (that
file has no dedicated `O-20` heading of its own — the fix is described inline there).

## O-21 — The deck's `ensureSession` path can't tell offline from any other bootstrap failure · tooling · found, not fixed (2026-10-04)

Filed by a reviewer round on the "useReveal: a genuine network failure is 'offline'" row
(`docs/handoff-2026-10-04.md`'s finish-line block 1): that row fixed the detail page's
`RevealFlow.tsx` (no `ensureSession` injected — `useReveal.ts` calls `session.bootstrap` itself
and can inspect the real error), but the deck's own path (`SwipeDeck.tsx`, `ensureSession`
injected from `use-feed-deck.ts`) still cannot. `ensureSession` collapses its result to a plain
boolean with no error object for `useReveal.ts` to check `instanceof TypeError` against.

**A real, reachable gap, not a theoretical one** — found by reading `use-feed-deck.ts` directly
rather than trusting an earlier claim that the deck's exposure window was "materially smaller"
than the detail page's (that claim was wrong and has been corrected in `useReveal.ts`'s own
comment, not left standing). `SwipeDeck.tsx`'s `handleCommit` calls `openReveal` *before*
`onSwipe`, so a first-ever right-swipe already triggers a bootstrap through this path; separately,
`use-feed-deck.ts`'s `onSwipe` does not await `ensureSession` before advancing the deck, and a
failed bootstrap there clears `sessionReadyRef` rather than caching anything useful. A device that
loses its connection and then right-swipes gets the generic "Щось не спрацювало на нашому боці"
copy instead of the honest "Зараз немає інтернету." — the same false claim R3's original
`useReveal.ts` made about every error, now narrowed to one path instead of closed on both.

What's needed to unblock: `ensureSession` (`use-feed-deck.ts`) returns a discriminated result
carrying the failure's error (or at least an `"offline"` tag) instead of a plain boolean, and
`useReveal.ts`'s two branches collapse into one that checks the same signal either way. A
contract-shape decision (what `ensureSession`'s return type becomes, since `use-feed-deck.ts`'s
own swipe-handling also reads its boolean today) worth settling before writing the fix, not a
one-line patch.

## O-22 — The mock's mobile photo-dot indicator sits where a redundant freshness overlay used to collide with it · design · done (2026-10-06)

Filed by a reviewer round on O-10/C6's photo gallery (`feat/d-6-detail-photo-gallery`), then
corrected and fixed by a second review round the same day. The mock's own D1/D2 frames
(`docs/design/Opika Registry Frames.dc.html`, opened directly — not taken from the design
doc's prose) put the photo's own navigation dots at the photo box's bottom-right corner on
mobile (D2: `right: 16px; bottom: 16px`), with the freshness block always a *separate* card
below the title in both frames — never overlaid on the photo, on mobile or desktop.

**Round 1's diagnosis was wrong about what was colliding.** It assumed `AnimalDetailScreen
.tsx`'s mobile freshness display and the mock's photo-dot corner were two different,
legitimate things fighting over one position, and shipped the gallery's new dot indicator at
bottom-*centre* to avoid that fight rather than resolve it. In fact the real, full freshness
block (pips + sentence + attribution) already rendered below the title on mobile exactly as
the mock specifies — what sat on the photo was a second, purely decorative cluster of the
*same three pips with no text*, duplicating information the real block already showed one
screen-width below. It existed only because an earlier version of this screen (predating
this row) put it there, not because the mock called for it anywhere.

**Fixed, round 2:** the redundant mini-pips overlay was deleted outright (no information
lost — the real freshness block alone was always sufficient), and `DetailPhotoGallery.tsx`'s
dot indicator moved into the corner the mock actually specifies (`right-4 bottom-4`), since
nothing now competes for it. `AnimalDetailScreen.tsx` no longer passes any overlay prop to
the gallery at all.

**Follow-up, not fixed here (round 3, 2026-10-06):** no test actually pins the dot
indicator's position — three straight review rounds got that position wrong or right by
reasoning rather than by a rendered assertion, and moving it back to bottom-centre tomorrow
would leave every current suite green. A harness check for the dot cluster's real bounding
box against the photo's bottom-right corner is a real gap, filed here rather than added
mid-row to a component whose basic interactive shape was still being corrected.

---

## Decisions 1 & 2 — Phase D, 2026-09-05

**Decision 1 — a skip is remembered for the device.** Skipped animals do not return in the deck
on reload or a later visit from the same browser. Persisted via `swipes` and the existing
anonymous session. Does **not** feed `scoreAnimal` — ordering inputs are unchanged, so
`/prytulkam` §3's «Це все, що впливає на порядок» stays true for the gallery/deck *ordering*
specifically.

**Hard constraint: exclusion is deck-only.** The gallery always shows every animal; a skipped
animal always remains reachable by direct link and in the list. A skip changes what the deck
re-serves, never what exists.

**Decision 2 — the deck gets two actions, contact opens inline.** «Не зараз» skips. «Написати»
reveals the contact in a sheet over the deck. «Далі» is dropped. The deck session survives a
contact (i.e. revealing doesn't exit the deck back to the gallery).

**Scope: this is an unbuilt feature on the product's namesake surface, not a fix.** Scoped as its
own row set (below), not folded into Phase D, and not started before Phase D finishes.

### V1 — was reveal's absence from the deck's browser client deliberate?

**Yes, deliberate — as phase-scope discipline, not as a permanent architectural decision to keep
them separate.** `browser-client.ts`'s own comment on `browserContract` (lines 6-25) says so
directly: *"the first client-side oRPC caller in the repo... deliberately not adding to this list
ahead of a phase that needs it, same discipline `server-client.ts` documents for its own trim."*
This matches `CLAUDE.md`'s standing "do not scaffold ahead of the current phase" rule.

It was never a decision that the deck *shouldn't* reveal contact — the design doc already
specifies it: `docs/design/README.md`'s deck section shows all three original buttons including
«Написати» (`flex: 1`, `#101112`), the keyboard table lists `→ написати` for the deck, and frame
05 (Contact reveal) is written as a general contact-reveal spec, not detail-page-specific. Decision
2 is building what was already specified, on the schedule the phase discipline always implied,
not overriding a prior "keep reveal detail-page-only" call.

### V2 — cookies vs. `/pro`'s copy

**Every cookie the deployed site can set, enumerated:** exactly one —
`__Host-session` in production / `session` in dev (`apps/web/src/api/session/cookie.ts`),
HttpOnly, SameSite=Lax, Secure (prod), `Max-Age=2592000` (30 days). It is set **only** when
`session.bootstrap` runs, which **at the time of this entry** fired only from the detail page's
reveal flow (`RevealFlow.tsx`). Confirmed both by code trace and empirically: production GETs to
`/`, `/tvaryny`, `/tvaryny/[id]`, `/tvaryny/gortaty`, `/pro`, and `/prytulkam` all came back with
no `Set-Cookie` header at all. Vercel Analytics + Speed Insights are cookieless by Vercel's own
design (and the codebase's own comment at `layout.tsx:65` says so); confirmed no other
cookie-setting code exists anywhere in `apps/web/src`.

**Stale as of R1, corrected R3 (Phase R, `docs/build-plan.md`, 2026-09-09) — this is now the
enumeration to draft R4's `/pro` copy from, not the paragraph above.** R1 added a second trigger
(any swipe, either direction, on the deck — `use-feed-deck.ts`'s own `ensureSession`); R3 added a
reveal on the deck itself (`SwipeDeck.tsx`, `apps/web/src/features/reveal/useReveal.ts`), sharing
that same session rather than minting a second one (a real double-mint bug this row's own review
found and fixed — see `docs/decisions-pending-review.md`). Still exactly one cookie per visitor,
same properties as above; what changed since this entry was written is which actions cause it to
be set at all — "tapped «Написати притулку» on the detail page" is no longer the complete list.

**The `/pro` sentence:** «Реєстр збирає базову статистику відвідувань … без кукі і без реклами.»
Grammatically this is scoped to the analytics clause, and that clause is true. **But it reads to
a plain visitor as a blanket "this site sets no cookies," and that blanker reading is already
false today** — anyone who clicks «Написати притулку» gets a persistent identifying cookie for a
completely different purpose (session/rate-limiting), and `/pro` discloses nothing about it.
Decision 1 does not change this cookie's existence, but it does give that same cookie's identity
a new, more visible job — remembering what a visitor skipped, across visits — which makes "this
registry doesn't use cookies" an even less accurate reader takeaway than it already is.

**Resolved, 2026-09-09 — Oleksii's decision on R1's STOP.** «без кукі» deleted from `uk.about.analytics`
(and the matching English), keeping «без реклами» — per the new standing constraint ("Removing a
false claim is not the same gate as adding one"), the disprovable-in-DevTools half was removed
immediately rather than left live while a fuller sentence was drafted. R4 (Phase R) adds the
honest fuller replacement — one session cookie, set only when the visitor acts, and what it's
for — which is still Oleksii's Ukrainian to write, not something to redraft unilaterally.

**R4-2 answered, 2026-10-06 — Oleksii's own Ukrainian, verbatim** (`docs/decisions-inbox.md`'s
R4-2 row has the full text: one cookie, set only after a first action, no PII, what it's for on
both sides — deck re-serve memory and the reveal rate limiter's free-re-reveal check — and its
7-day-idle/30-day-absolute expiry). **Not yet landed in `uk.about.analytics`** — gating question
below, open.

**Gating question, raised by Oleksii alongside the R4-2 text, 2026-10-06:** «одне кукі» is false
for as long as the pre-launch gate (`__Host-prelaunch-gate`, `apps/web/src/api/prelaunch-
gate.ts`) is live — a real visitor reaching `/pro` through the gate link already carries a second
cookie the new sentence doesn't mention. Oleksii chose option (a) — land R4-2 together with the
gate's removal, not behind a new runtime condition — on two further conditions.

**Condition 1: couple R4-2 to the gate's removal specifically, not to
`SITE_IS_PUBLICLY_DISCOVERABLE`, unless they're actually the same step today.** They are, checked
directly rather than assumed: `apps/web/src/proxy.ts:54` reads `if (!SITE_IS_PUBLICLY_DISCOVERABLE)
{ ...gate logic... }` — the gate's entire on/off switch *is* that flag, with no separate signal —
and `apps/web/src/seo-flags.ts`'s own comment on the flag says so in words: "[the gate] comes down
in the same change that flips this flag... before this flag can ever be `true` while the gate
still exists." `docs/build-plan.md`'s R4 row now records R4-2 against the gate's removal, naming
`SITE_IS_PUBLICLY_DISCOVERABLE` only as today's concrete implementation of that condition — if a
future change ever decouples a "gate removed" signal from this flag (e.g. the noindex timing
moving independently, which Oleksii flagged as still open), whatever reads this flag for this
purpose needs to move to the new signal instead, not keep reading the wrong one by habit.

**Condition 2: a tripwire, since copy that's merely incomplete (not false) earns no
`[COPY_PENDING]` marker and would otherwise go unnoticed.** Required before this is considered
resolved; landing in its own follow-up commit, separate from R4-1's. Cost acknowledged in the
meantime: R4-2 doesn't go live until gate removal, which could be a while given "finish first,
then demo" (Decision 1).

**Falsified by** (recorded now so the sentence doesn't go stale silently later): any new cookie
set on the adopter side; `session.bootstrap` being called before a user action rather than only
after one; a `DEFAULT_SESSION_POLICY` change to the 7-day-idle/30-day-absolute expiry the
sentence states; H2's Better Auth shelter-admin cookies are a *different* actor
(«Людині, яка шукає тварину» scopes the sentence to adopters, not shelter staff), so H2 does not
by itself falsify this — but re-check the sentence's scoping once H2 ships, since a page that
also serves shelter-admin traffic could blur the distinction a careless edit might not notice.
Phase 2's rewarded-video ads (`docs/stack-decision.md`) will falsify the same key's «без реклами»
clause — a pre-existing risk, not new to this entry, but recorded here since both clauses now
live in the same sentence and a future editor touching one should see the other.

### V3 — is the anonymous session identity stable across reload / restart?

**Yes, confirmed empirically, not just by reading the code.** Ran `session.bootstrap` against a
local instance (schema/seed data identical to production, `DATABASE_URL` pointed at local
Postgres): first call minted a session and returned adopter `c166d619-…` with
`Set-Cookie: session=…; Max-Age=2592000`. Resending that exact cookie on a second call returned
the **same** adopter id, with **no** new `Set-Cookie` — i.e. simulating a reload does not re-mint.
`validateSession` (`apps/web/src/api/session/manager.ts`) is a real get-or-reject: unknown/invalid
tokens return `{ok:false}` rather than silently creating a session, and only *then* does
`sessionBootstrap` mint a fresh one — that "half-works silently" failure mode does not exist.
Because the cookie carries `Max-Age` (not a browser-session-only cookie), it survives a browser
restart by ordinary cookie semantics, for up to 30 days absolute / 7 days idle
(`DEFAULT_SESSION_POLICY`). Past either expiry, the visitor becomes a new anonymous identity and
previously-skipped animals reappear in the deck — expected behaviour for an anonymous product,
worth Oleksii knowing rather than assuming "device-scoped" means "forever."

### Commitments register — `/prytulkam` §3

**Resolved, 2026-09-09 — Oleksii's decision on R1's STOP.** «Обидва способи показують усіх»
became false for the deck under Decision 1, the moment R1 shipped real per-device swipe memory.
Per the new standing constraint ("Removing a false claim is not the same gate as adding one",
`docs/standing-constraints.md`), the false sentence was **deleted immediately** rather than held
until its replacement was written — `whatHappensToAnimals` now states only the list/one-at-a-time
mechanism, not the show-everyone claim.

**English sense, corrected 2026-10-06** (the first draft, directly below in strikethrough-by-
convention since this file doesn't delete its own history, undercounted what the deck actually
excludes — it named only `pass`, not `interested`, and didn't say passed-on animals return):
~~the list shows everyone; the deck does not re-serve what you skipped; nothing is hidden from you
that you did not hide yourself~~ → **the list shows everyone; the deck does not re-serve what you
passed on or asked about, on this device only, and passed-on animals return later; nothing is
hidden that you did not hide yourself.**

**R4-1 resolved, 2026-10-06 — Oleksii's own Ukrainian, verbatim, landed in
`whatHappensToAnimals`** (`docs/decisions-inbox.md`'s R4-1 row has the full text). No longer
pinned as "temporarily narrowed" — see `docs/standing-constraints.md`'s commitments register row
8, updated to match.

### New feature row set (scoped, not started)

Device-scoped skip persistence (`swipes.record` wired from the deck, keyed off the existing
anonymous session) + two-action deck (drop «Далі») + inline contact-reveal sheet (wire
`session.bootstrap`/`animals.reveal` into the deck's own browser client, per the design's frame
05) + the `/prytulkam` §3 copy amendment above. Its own row set in `docs/build-plan.md` ("Phase
R"), scheduled after Phase D, not folded into it.
