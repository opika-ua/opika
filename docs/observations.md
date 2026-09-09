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

## O-1 — Header is a text wordmark, no logo · design · open

No logo in the header; the wordmark is plain text. A logo exists in the Claude Design export.

Check the design export for what was specified before assuming a logo belongs there — the
«Реєстр» system may have chosen a wordmark deliberately. If it did, this is a change of
decision, not a defect, and should be recorded as such.

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

## O-4 — Filter label to pill spacing too tight · design · open

The gap between «МІСТО» / «ВИД» / «РОЗМІР» / «ВІК» and the pills below is visually too small.

Open the mock before changing anything. Either the implementation drifted from the design
system's spacing token, or the mock itself is tight — different fixes, and the design doc is the
authority.

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

## O-7 — The no-match explainer is confusing · design · open

«Немає фільтра "тільки свіжі картки". Тварина, про яку давно не писали, все одно чекає.»

Oleksii's call, and it settles an older disagreement: the copy critique wanted this cut, that was
overruled because the sentence is verbatim mock copy (`Opika Registry System.dc.html:275`) and
the mock is authority absent a decision from Oleksii. He has now made the decision.

Record it as a design-system change, not a bug — the mock and the code must not silently
diverge.

## O-8 — Detail page breadcrumb lives in the header · design · open

«← Усі тварини у Бровари» renders inside the site header beside the wordmark, where it reads as a
navigation item. It belongs below the header, above the content, left-aligned.

Moving it out of the header is the direction README:589 ("never two navigations at once") points
anyway.

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

## O-10 — Detail page has no photo gallery · design · open

Only the primary photo is viewable at size. The others are small thumbnails that cannot really be
seen, and on large screens they waste the available space. Wants a slider or comparable.

**Pairs with C6** (detail-carousel crop against real source aspect ratios), which is already open
and waiting on real photographs from D-6. Same component, same session — do not do them
separately.

## O-11 — No footer · design · open

No footer anywhere. Nowhere for secondary links, and nowhere for credits.

**Related to O-13** — the footer is the natural home for the font attribution.

## O-12 — The back link does not restore the filter · BUG · open

«← Усі тварини у Бровари» on a detail page returns to the unfiltered gallery, not to Brovary. The
link's text makes a claim the navigation does not honour — worse than a layout issue, because the
user is told something untrue.

**Pairs with O-6** — once cities have slugs, the filter is expressible in the return URL.

## O-13 — Font attribution placement · design · open

«Шрифт e-Ukraine — Міністерство цифрової трансформації України … CC BY 4.0» sits where it is
visually intrusive.

The attribution is required — CC BY 4.0 obliges it and removing it is not an option. Placement is
not prescribed: the licence asks for attribution in a manner reasonable to the medium, and a
credits line in a footer or on /pro is normal web practice. Keep the text, move it to a single
credits location (footer per O-11, or /pro), and keep the information intact — typeface name,
author, source, licence.

Not legal advice; if exact wording ever matters, read the licence deed directly.

## O-14 — Informative pages feel too narrow on large screens · decision · DECIDED

/pro and /prytulkam use a narrow centred text column that looks lost on a 2K monitor.

**Decision: keep the measure, fix the composition.** The ~65-character line length is deliberate
and widening it makes long-form text harder to read. What changes is the page around it — the
column stops being alone on an empty field.

Schedule after the MVP gate.

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
mechanism, not the show-everyone claim. Amendment (English sense — Ukrainian is still Oleksii's, and is now R4's whole remaining job, not a
fix for a false sentence; not pinned by `copy-status.test.ts` — the false sentence was deleted, not
replaced with a `[COPY_PENDING]` placeholder, so no marker currently exists for that test to catch):
**the list shows everyone; the deck does not re-serve what you skipped;
nothing is hidden from you that you did not hide yourself.** The deck-only constraint above is
what keeps this a small amendment rather than a reversal of the commitment.

Now row 8 in `docs/standing-constraints.md`'s commitments register (`CLAUDE.md`'s "Commitments
the «Для притулків» page makes"), recorded as temporarily narrowed rather than satisfied.

### New feature row set (scoped, not started)

Device-scoped skip persistence (`swipes.record` wired from the deck, keyed off the existing
anonymous session) + two-action deck (drop «Далі») + inline contact-reveal sheet (wire
`session.bootstrap`/`animals.reveal` into the deck's own browser client, per the design's frame
05) + the `/prytulkam` §3 copy amendment above. Its own row set in `docs/build-plan.md` ("Phase
R"), scheduled after Phase D, not folded into it.
