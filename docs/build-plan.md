# Opika — Build Plan

**The single plan.** This document, `docs/standing-constraints.md` (the rules that apply
to every phase) and `docs/design/README.md` (the design, now including the gallery and
desktop breakpoints) are the three documents `.claude/commands/phase.md` reads before
starting any phase.

`docs/course-correction.md` is now a pointer to this document — its reasoning (why the
gallery became primary, the pattern behind three verification failures) is worth reading
once; its plan content lived here from the moment this rewrite landed.

**Capacity:** ~10 h/week solo, ~8 h/week of it code, ~2 h/week shelter recruitment — the
actual gate on launch date, unaffected by anything below.

---

## Part 1 — History: M0 through M5

What was originally a milestone-by-milestone plan (M0–M12) is now two things: this
history section, recording what M0–M5 actually delivered against what was originally
scoped, and Part 2, the phases that replace the original M6–M12 — restructured once,
after an audit found the original plan phone-only and unaware that the gallery is now
the primary surface.

Full detail on individual decisions from this era — the verification FSM edges, the
evidence-item shape, the anonymous-session design — stays in `CLAUDE.md`'s decision
lists; nothing here duplicates those.

| Milestone | Scoped | Delivered |
|---|---|---|
| **M0** — repo & tooling | pnpm workspace, strict TS, Biome, Docker Postgres, CI skeleton | Done. `pnpm i && pnpm check` on a clean clone is the standing bar — restated here because M0 once reported it green without having been run at all (see `docs/standing-constraints.md`) |
| **M1** — contracts + domain | Branded IDs, `Shelter` + verification FSM, `Animal` unions, `Freshness`, `scoreAnimal`, 8-procedure oRPC contract | Done. Zero non-Zod dependencies in `packages/domain`; exhaustive FSM transition table; freshness correct at all uk plural boundaries. 252 tests |
| **M2** — persistence | Drizzle schema, repositories, keyset feed query, HMAC location fuzzing | Done. `packages/db/test/feed-explain.test.ts` asserts the feed query's `EXPLAIN` plan has no `Sort` node and uses the partial index — mutation-checked (temporarily dropping the index makes the test fail) during this rewrite, closing an open contradiction from the pause brief: an earlier audit claimed nothing verified index usage; the test existed, ran, and was correct. The audit was wrong, not the test. 31 tests |
| **M3** — seed data | 300+ animals, realistic distributions | Done. 320 animals, 8 shelters, shaped freshness and vaccination distributions, fostered animals, real photos. `db:seed` itself has not been re-run in a verification pass since — still merely asserted, not a live gap this rewrite closes. 27 Biome console warnings in the seed script are known and deliberately deferred — a dev-only script, not shipped code |
| **M4** — minimal API | oRPC router, anonymous session, rate limiting | Done, and hardened beyond the original scope: hand-rolled anonymous device session (not Better Auth — that's deferred to shelter accounts), HMAC-signed cursors bound to a filters fingerprint, split rate limiting (per-IP sliding window; Postgres-persisted reveal limit). Session security properties — timing-safe comparison, `__Host-` cookie in production, 30-day/7-day expiry — are implemented but still merely asserted: no test currently exercises them end to end |
| **M5** — swipe deck | `PointerEvent` + `transform`, release physics, deck component | Done, but this is the milestone the process failures cluster around. "`/discovery` renders" was originally verified by fetching HTML and grepping for card text, while an action row sat on top of the card and the gesture was dead. The rendering harness (`apps/web/test/harness`, Playwright) and the fixes it verifies — six of them, each now locked by a harness assertion or a unit test — are what actually closed this. Visual properties that aren't geometry (the 6° rotation cap, the 0.03deg/px factor, the 40px affordance ramp) still have no assertion; `onPointerCancel` ignoring `prefers-reduced-motion` is a known, deliberately deferred gap; iOS Safari's swipe failure has never reproduced on any other engine and — now that the deck is a mode entered from the gallery, not the front door — is off the critical path |

**Test counts at the end of M5:** 307 vitest (domain 252, contracts 24, db 31), 0 harness.

### What M5's audit changed, and why the plan restructured

Two things landed at once: a build failure that had been invisible to CI (`tsc` accepts
`./x.js` relative imports under every resolution mode; the bundler doesn't — `next build`
had never run), and a new, correct requirement that the original plan never carried:
**the app must work on desktop, and animals must be browsable as a gallery, not only as a
swipe deck.**

The gallery becomes the **primary surface**, not the deck — it's what search engines
index, what gets pasted into a Telegram group, what a grant reviewer or shelter director
opens on a laptop. The deck remains the differentiator and still ships, but as a mode
entered from the gallery, and off the critical path for launch. Full reasoning —
including the pattern behind the three verification incidents, now generalised into
`docs/standing-constraints.md` rather than restated per-document — is in
`docs/course-correction.md`.

**Consolidation work that followed the audit, before any gallery code:**

| Landed | What |
|---|---|
| PR #15 | Verification gate — the Playwright harness, `next build` gated in CI, happy-dom + Testing Library, the six M5 fixes restored and locked |
| PR #16 | Tailwind migration, `next/font` typography (Literata + Commissioner; IBM Plex Mono measured and dropped — 11.2% of font payload for one rarely-seen label), the `implement(contract)` security lock (`handlers-implement-contract.test.ts`), measurable margin enforcement in the harness |
| PR #17 | Design handoff v2 landed at `docs/design/` (same path v1 was at — never a folder move), prototyping-runtime cleanup |
| PR #18 | This plan rewrite, `docs/gallery-contract-decisions.md`'s five decisions, `docs/standing-constraints.md` |
| C4 + C7 (this branch) | `packages/ui`/`packages/i18n` extracted, `en.ts` added, the real home page (Screen 01) replacing `page.tsx`'s placeholder — Phase C fully closed out |

**Test counts now:** 409 vitest, 17 harness.

---

## Part 2 — The phases

Five phases replace the original M6–M12. Each has an id `.claude/commands/phase.md` can
be invoked with (`/phase C4`, `/phase E`, a bare phase letter or a specific task within
it), its tasks, an hour estimate, a definition of done, and the decisions that phase must
surface before or during implementation.

A sixth thing from the original course correction — **design pass 2** (desktop
breakpoints, the gallery) — is not a phase here because it is already done: v2 of
`docs/design/README.md` (34.5 KB, "Breakpoints & Surfaces", "The Gallery", "Desktop
Breakpoints for the Eight Screens") is in the repository. It is folded into Part 1's
history rather than carried forward as live work.

### Phase C — Consolidate and unblock

**Nothing new is built until the foundation supports two form factors and the process
can tell truth from shape.** All seven tasks are done.

| # | Task | h | Status |
|---|---|---|---|
| C1 | Merge everything — one `main`, one truth | 3 | **Done.** M4 follow-up, M5, the bundler fix, PRs #15–#17 are all on `main` |
| C2 | Verification gate — harness in CI, `next build` gated, markup-inspection ruled out as evidence | 6 | **Done** (PR #15), and generalised into `docs/standing-constraints.md` |
| C3 | Tailwind migration — `tokens.ts` → Tailwind `@theme`, deck converted from inline styles | 8 | **Done** (PR #16). Pixel parity verified by screenshot diff, not assumed |
| C4 | Extract `packages/ui` and `packages/i18n` — primitives out of `features/discovery`; strings out with them; add the English file the design's string table implies | 8 | **Done.** `freshness-display.ts` moved to `packages/ui` as the one genuinely cross-feature primitive; `tokens.ts` stayed put — `layout.stackLayers` is deck-only, and C3 had already moved the real design tokens into `globals.css`'s `@theme`, so there was less here to extract than the task line assumed. `strings.uk.ts` moved to `packages/i18n`, `en.ts` added (key-parity tested against `uk.ts`) |
| C5 | Wire the typography — `next/font`, Cyrillic + Latin subsets, measure the payload | 2 | **Done** (PR #16) |
| C6 | Component test infrastructure — RTL + happy-dom, real tests proving the setup | 4 | **Done** (PR #15) |
| C7 | A real `page.tsx` | 3 | **Done**, on a corrected done-when — see below |

**Done when:** the home page is a real entry point (Screen 01, on-design, not "API-only at
this milestone"), design tokens and shared strings live in `packages/ui`/`packages/i18n`
(not `features/discovery`), an English string file exists, and `pnpm check` stays green
throughout.

**Correction to C7's original scope, made while implementing it:** the task line called
for "a view-mode switch with a persisted preference" — unbuildable this phase, since the
gallery it would switch to doesn't exist until Phase E. Screen 01 gives `page.tsx` a real,
fully-specified entry point on its own (wordmark, promise, disclaimer, city chips, CTA),
so C7 delivers that and routes the CTA to `/discovery` — today's only real destination.
The view-mode switch, and its `sessionStorage` persistence, move to Phase E's task list
(below), where the gallery shell it belongs to actually gets built. This is the same
"plan conflict" the `/phase` gate exists to catch — caught and resolved before building
the wrong thing, not discovered after.

**Decisions this phase surfaced:**
- Whether `packages/ui` takes any dependency beyond what's already justified in the
  catalog — **no.** It holds pure TS (`freshnessPips`/`freshnessLabel`), depending only on
  `@opika/domain` and `@opika/i18n`, both internal workspace packages, not new external
  ones.
- Where the new, still-mobile-shaped Screen 01 gets its real `CityId`s from — the
  existing `cities.list` procedure, called in-process (`anonymousRouterClient`,
  `docs/gallery-contract-decisions.md` §5), rather than a client-side fetch that would
  have needed `@orpc/client` as a new dependency. This is that mechanism's first real use,
  pulled forward from Phase E because Screen 01 needed real IDs, not because Phase E's own
  work started early.
- City-filter storage — `sessionStorage`, extending the design's one explicit storage
  precedent (the gallery/deck view-mode memory) to the filter state Phase E's rail will
  also read. Reuses `@opika/domain`'s existing `FeedFilters`/`NO_FILTERS` directly, not a
  parallel shape, so Phase E needs no migration.

### Phase E — Gallery

**Do this after Phase C.** `docs/gallery-contract-decisions.md`'s five decisions are
settled (owner sign-off, 2026-08-07) — the gate this note used to describe is closed;
what's below already reflects the decided shape, not an open question. Building gallery
UI ahead of the contracts it needs would still be the M5 mistake (grep for card text,
ship a dead gesture) in a different shape — the gate just isn't a *decision* gate
anymore, it's an *implementation-order* one.

| # | Task | h |
|---|---|---|
| E0 | Contract + schema reconciliation — `gallery.list` (OFFSET), `gallery.relaxationCounts`, `wait_anchor_at` column + both indexes (unfiltered and filtered) + `waitAnchorOf`, `reserved` gains `publishedAt` (`packages/domain` type change + a backfill across the 320 seeded rows), `buildFeedPredicate` factored out of `feedRepo.list`, both new procedures added to `packages/contracts`' `contract` export | 12 |
| E1 | Gallery grid over `gallery.list` — responsive columns (1/2/3/4 per the design's breakpoint table), `AnimalCard`, freshness marker reused from the deck | 10 |
| E1.5 | Image resolution stub — `storageKey` resolves to a real URL through one function H1 later replaces; licence-clean placeholder photos in the repo; seed wired deterministically. Makes E2–E5 visually reviewable and gives shelter outreach something to show. Not the real pipeline — no R2, no upload, no variants | 3 |
| E2 | Filters as a visible rail (≥1024) / the existing sheet (<1024), extended with sort. Filter and sort state in the URL — shareable, back-button-correct | 6 |
| E2.5 | 2D arrow-key navigation across the gallery grid (`docs/design/README.md`'s "Keyboard" table — ← ↑ → ↓ move focus by column count, edges don't wrap; Home/End jump to first/last card), independent of ARIA role. Runs before E3/E4 so page-boundary and zero-result focus behaviour are inherited already-settled, not invented per-phase. Tab order deliberately untouched — every card keeps its native tab stop and arrow keys are a purely additive client-side shortcut. Issue #28's own roving-tabindex constraint was dropped on review: it contradicts the same ticket's "Tab order unaffected: still header → rail → sort → cards in reading order → pagination" requirement, which `docs/design/README.md`'s Keyboard table states too and therefore wins (see `ArrowKeyGrid`'s doc comment). The harness asserts the arrow behaviour (JS on, by definition) and the unchanged Tab order (JS on and JS off) separately | 3 |
| E3 | Numbered pagination — `?stor=N`, prev/next, active page leaf-filled, all targets 44px. Not infinite scroll (`docs/design/README.md` "Pagination — not infinite scroll" gives the reasoning: indexed URLs, working back button, shareable into Telegram). **Definition of done includes** a skip link above the grid, visible on focus, jumping straight to the pagination controls — dropping E2.5's roving tabindex means a keyboard user now tabs through all 24 cards to reach "next page," and this is the fix, not a follow-up. Arrow-key behaviour at a page boundary (Right on the last card, Left on the first) is this phase's to decide and record — see `docs/gallery-contract-decisions.md` §8 | 4 |
| V1 | Design handoff intake — replace `docs/design/` with the new handoff, verify it covers every surface, confirm the four product rules survive | 2 |
| V2 | Implementation — new tokens through `packages/ui` and the Tailwind config, every existing surface re-skinned including E3's pagination, harness assertions repointed to the new design's values. **Static visual language only** — colour, type, radii, card treatment. The deck's gesture *physics* (release spring, motion timings on the drag itself) are explicitly out of scope here — see G4 | 10 |
| E4 | Empty (no-match, already built in V2 — this row is the remainder), error (**one state**, not the design's stated whole-list/next-page pair — pagination is plain link navigation per `docs/gallery-contract-decisions.md` §7, so a failed next page and a failed first load are the same event to this app's router; the "Next-page error" frame is marked NOT REACHABLE, not deferred, in `docs/design/README.md`), out-of-range page (200, last valid page, **the note must actually render** — see the phase's own done-when below, not just the copy existing) states — built in the «Реєстр» language directly (`docs/design/README.md`'s "States and remaining screens", frames E1/E2, P1/P2). Loading (L1/L2) was investigated and NOT built this phase — Next's route-level `loading.tsx` breaks the no-JS path outright (see `docs/gallery-contract-decisions.md`'s note); a correct version needs a client-driven pending indicator, real new scope, tracked as a follow-up, not this row's remaining hours | 4 |
| E5 | Gallery ↔ deck view-mode switch — moved here from C7 (`docs/build-plan.md`'s Phase C correction): a control with only one working destination isn't buildable before this phase. Real scope turned out much larger than "chrome": no browser-side oRPC client existed yet, `/discovery` still ran entirely on mock data, and no gallery-side entry control existed at all. Built: `/tvaryny/gortaty` as the deck's real, `noindex` route on real `feed.list` data (browser-side oRPC client, cursor/prefetch, `useFeedDeck`); the gallery's own entry control (desktop header + mobile row, hidden when there are zero matches); exit ("До списку" / Esc / browser back — genuinely one mechanism, `router.back()` when a same-tab marker confirms it's safe, else a fresh gallery link) with scroll-restore coming from the browser's own history mechanism, not custom bookkeeping; the inherited-filters header phrase and position/progress counter (carried-over total, since `feed.list` has no count of its own). Also investigated and resolved: the E4-carried "header/rail stay usable during an error" gap — found the guessed fix (a `layout.tsx` split) structurally impossible (layouts can't read `searchParams`) and, separately, not actually useful (a filter rail doesn't help when the failure is backend-side); shipped a real escape hatch instead (a link to the bare, unfiltered gallery) — see `docs/design/README.md`'s "Whole-list error" section | 3 |

**Total: ~57 h.**

**Why E1.5 exists as its own task rather than waiting for H1:** every phase from E2 on is
reviewed against what the gallery actually looks like — filter and sort results, empty and
loading states, the pagination footer. Building E2–E4 against a grid of broken image icons
repeats exactly the retrofit pattern this course correction exists to stop: the visual
problems surface all at once, in one lump, the day real photos finally arrive at H1,
instead of being caught phase by phase as they're introduced.

**Why E2.5 exists as its own task rather than folding into E2 or E3:** it was found during
E1.5's own residue check (closed, incorrectly, as won't-do — see
`docs/standing-constraints.md`, "An accessibility technicality never closes a design
requirement") and confirmed as real, unbuilt scope once `docs/design/README.md`'s own
"Keyboard" table was actually read rather than inferred from ARIA semantics. It sits
between E2 and E3 specifically because keyboard behaviour at a page boundary (E3) and
focus behaviour against zero results (E4) are exactly the kind of thing each phase would
otherwise invent independently if arrow-key navigation didn't already exist to answer them
first — issue #28 records both of its build-time constraints in full, of which only the
ordering one survived the build: its roving-tabindex constraint was dropped because that
mechanism contradicts the same ticket's own "Tab order unaffected" requirement, and arrow
keys ship instead as a shortcut layered over an untouched Tab order.

**Why Phase V sits between E3 and E4, not before E3:** a new visual-language handoff
replaces `docs/design/` (V1 intakes and verifies it; V2 re-skins). E3 shipped first, so V2's
re-skin is now scoped to include E3's pagination alongside everything E0–E2.5 already
built — one re-skin pass over the whole gallery surface built so far, rather than E3
building against a design that's about to be replaced. It sits before E4/E5 so those two
build against the final visual language once, instead of shipping against the old one and
absorbing a second re-skin pass later.

**Why there's no Phase V3.** V2's own scope (`docs/design/Opika Registry System.dc.html`)
had no mock for E4's four states, E5's deck chrome, or F's screens 04–07 — those surfaces
were unbuilt code, not existing UI to re-skin, so V2 skipped them. The plan on the table at
the time was that E4/E5/F would build them on the old tokens regardless, and a follow-up
phase — referred to informally as "V3" — would re-skin them later once a mock existed, the
same way V2 itself re-skinned E0–E3. That follow-up phase is not needed: a design addendum
(`docs/design/intake-report-v3.md`) shipped a real, dual-viewport mock for every one of
those surfaces — `docs/design/Opika Registry Frames.dc.html`, 18 frames — before E4, E5, or
F started. Each phase builds its own surfaces in the «Реєстр» language directly instead,
per the frame citations on E4/E5 above and F below. No hours are being removed from this
ledger for the cancelled follow-up phase, because none were ever allocated to it — "V3" was
a name for anticipated future work, not a scoped, written phase with its own line in Part 3.
The only real change to this ledger is F6, below, which **is** new: screen 07 (the deck's
exhausted state) had no owner at all before the addendum, old-tokens or otherwise.

**V2's definition of done, beyond "re-skinned":**
- **Pagination's "з N" count is a behaviour change, not a restyle, and needs its own test.**
  The new handoff makes it conditional — it renders only when the page-number list is
  truncated with an ellipsis (`docs/design/README.md`, "Pagination — not infinite scroll";
  confirmed against the mock, `docs/design/intake-report.md` §C). E3's `GalleryPagination`
  renders it unconditionally. Truncation logic doesn't get verified by looking at it — a
  harness test asserting the count is absent at a small page count and present once the
  window truncates is required, separate from any visual/colour assertion on the same
  element.
- **e-Ukraine attribution ships as part of this phase, not deferred.** CC BY 4.0 + self-
  hosting the files is distribution, which triggers the licence's attribution requirement —
  the handoff itself states this wrong ("free to use", no attribution mentioned; verified
  independently, `docs/design/intake-report.md` §E). Required: a licence file alongside the
  font files in the repo, and a user-reachable credit (footer colophon or `/about`). Also
  added to H5's legal-pages list below.
- **e-Ukraine subsetting is a tracked follow-up, not a V2 done-when criterion — see H3.5
  below.** The three vendored files (`apps/web/src/app/fonts/e-ukraine/`) ship at the
  mirror's full character set for now, deliberately: subsetting picks a glyph set, and the
  glyph set can't be finalised until H3 lands the English strings and the native-speaker
  pass on the Ukrainian copy, both of which can introduce characters V2 never used. Moved
  out of this list because a bullet under "definition of done" is a done-when item by
  construction, and this one explicitly isn't required to close V2.
- **Deck gesture physics is explicitly excluded.** The release spring, drag motion timings,
  and easing curve values the new handoff specifies for the deck move to Phase G (G4,
  below) — not V2. G already owns the deck's unresolved iOS investigation, which touches
  the same constants (`use-swipe-gesture.ts`) and would otherwise mean changing them twice.
  V2's own deck work is limited to the card's static visual treatment (colour, type, radii)
  under the existing physics.
- **Every harness assertion V2 repoints gets a one-line note saying which design value
  changed and to what**, so a reviewer can confirm each change tracks a real design value
  rather than a quietly relaxed assertion — a redesign is exactly the kind of cover that
  makes that hard to tell apart from a distance.
- **Skin, not skeleton.** Breakpoints, column counts, the 960/1320 containers, the rail/sheet
  split at 1024, the URL scheme, and the information architecture do not move. If the new
  design turns out to require any of them to move, that is a stop, not a V2 task.

**Done when:** someone browses the full corpus on a 1920px desktop and a 360px phone,
filters and sorts on both, shares a URL that reproduces exactly what they saw, and the
no-match state's suggestions carry real numbers computed by `gallery.relaxationCounts`,
not placeholders.

**One case in that "reproduces exactly" claim needs its own check, not just its own
copy.** E0's out-of-range clamp (`docs/gallery-contract-decisions.md` §3, "Rate limiting"
neighbour note aside) means a stale `?stor=50` against a shrunk corpus now serves page 10
with a 200 — correctly, per the decided behaviour, but a URL that no longer shows what it
once did **without saying so** is exactly the silent-divergence failure this same "done
when" line exists to rule out for every other case. E4 is done only when that note
actually renders on the clamped page — verified by loading a URL past the true last page
and seeing it, not by the copy existing in `docs/design/README.md` and being assumed
wired in.

**Decisions this phase implements, already settled** (`docs/gallery-contract-decisions.md`,
restated so the answer isn't re-litigated mid-implementation):
- `reserved` carries `publishedAt` forward (§2) — yes. Domain type change + backfill, E0.
- The "сусідні міста" copy (§4) — changed to "Уся Київщина," recorded as a deviation in
  `docs/design/README.md` directly. No adjacency schema.
- The 2,000-row OFFSET boundary (§1) — kept at 2,000; confirm it hasn't already been
  reached by the time this phase starts (it won't have been; the check costs one query).
- Out-of-range gallery page (§3) — clamp to the last valid page server-side, 200, not an
  error, not a redirect. Copy written, in `docs/design/README.md`.
- The second, filtered `wait_anchor_at` index (§2) — build it, E0. No `Sort`-node
  exemption.

### Phase F — Detail & Reveal

The former M6, responsive from the start rather than retrofitted, and now the SEO path
the acquisition argument depends on (`docs/course-correction.md`, "The strategic
call": no marketing budget, so shared links and indexed pages are the growth mechanism).

| # | Task | h |
|---|---|---|
| F1 | Animal detail page, both form factors, in the «Реєстр» language — desktop per `docs/design/README.md` "04 Detail" / frames D1/D2 (sticky left column, fluid right, footer action pair moves up under the freshness block); mobile is the existing 04, re-specified at frame D2 | 10 |
| F2 | `generateMetadata` / Open Graph on the detail page, via the same in-process router call `docs/gallery-contract-decisions.md` §5 establishes — never more than the public contract already permits a client to see | 3 |
| F3 | Contact reveal, in the «Реєстр» language — desktop modal (640-wide, focus-trapped, animal's URL stays in the address bar) over the existing full-screen mobile 05, per frames R1/R2 | 4 |
| F4 | "My reveals" list, both form factors, in the «Реєстр» language — frames M1/M2 | 3 |
| F5 | Donation link — external, destination domain visible, `rel="noopener"` | 2 |
| F6 | **Addition** — screen 07, the deck's exhausted state (`ExhaustedState` in `SwipeDeck.tsx`), in the «Реєстр» language directly per frames X1/X2. Had no mock and no owning phase before the addendum — deliberately excluded from V2 (`docs/design/README.md`'s V2 commit note: "screens without a V2 mock — old tokens, deferred") and never picked up anywhere else. `LoadingState`/`ErrorState` in the same file stay deferred — the addendum's frames cover the gallery's loading/error states (E4), not the deck's | 2 |

**Total: ~24 h.**

**Done when:** the detail page is reachable and correctly metadata'd without JavaScript,
the reveal modal traps focus and restores it on close, "my reveals" renders identically in
substance on a phone and a 1440px desktop, and the deck's exhausted state matches frames
X1/X2 rather than the old tokens it shipped with through Phase G.

**Decisions this phase must surface:** whether the Open Graph image is a static per-animal
render or generated at request time (cost/freshness trade-off — the image pipeline this
depends on is Phase H's M7-equivalent work, so this may block on that, not before).

### Phase G — Deck completion

**Off the critical path — ships when it works, does not block launch.** The deck is a
mode entered from the gallery now, not the front door.

| # | Task | h |
|---|---|---|
| G1 | iOS Safari investigation, restarting from scratch — the prior investigation notes were lost with the rest of the uncommitted M5 work (the incident behind `docs/standing-constraints.md`'s "commit after each task" rule) and are deliberately not being reconstructed; the failure has never reproduced on any other engine | 4 |
| G2 | Device testing on real hardware — Android and iOS, not simulators | 3 |
| G3 | Promote the deck from `/discovery` to its real route (`/tvaryny/gortaty` per the design's URL scheme, `noindex` — a viewing state, not a page), entered from the gallery with the gallery's current filters and sort inherited | 3 |
| G4 | Deck gesture-physics re-skin — the new handoff's motion values (`docs/design/README.md`, "Geometry, density, elevation, motion": quick 120ms / settle 220ms / reveal 280ms, `cubic-bezier(0.3, 0, 0, 1)`; release spring stiffness 280 / damping 30, no overshoot) applied to `use-swipe-gesture.ts`'s own constants — moved out of V2 deliberately (`docs/build-plan.md`'s Phase E table, V2 row) so these values change once, alongside whatever G1's iOS investigation also touches in the same file, not twice | 3 |

**Total: ~13 h.**

**Done when:** 30 uninterrupted swipes on a real mid-range Android and a real iPhone,
entered from and returning to the gallery at the same scroll position and card, on the new
motion values.

**Decisions this phase must surface:** none anticipated for G1–G3 — flag if the iOS
investigation turns up a fix that touches `packages/domain` or the gesture's pure decision
function, per the standing stop-gate. G4 is gesture-physics work
(`docs/model-policy.md`: "M5 swipe deck | Opus | Gesture physics and pointer capture") —
model it Opus, not Sonnet, regardless of what the rest of G uses.

### Phase H — Remainder to launch

The former M7–M12, unchanged in substance, two additions here. The original course
correction listed two; its second (the count queries) moved into Phase E's E0, folded
into `gallery.list`'s output per `docs/gallery-contract-decisions.md` §3.

| # | Task | h |
|---|---|---|
| H1 | Image pipeline — R2, presigned upload, `sharp` variants, CDN. Replaces E1.5's `apps/web/src/image-loader.ts` stub — the app's single `next/image` loader — with real R2/CDN URL construction, which is a change to that one file and not to any call site in `AnimalCard`/`SwipeCard`, and retires E1.5's committed placeholder photos | 10 |
| H2 | Internal admin — animal/shelter CRUD, CSV import, **desktop layouts** (addition — the original plan assumed a single admin form factor) | 12 |
| H3 | i18n — next-intl wiring, uk + en message files, full-ICU boot assertion. Also: native-speaker review of `pluralizeUk`'s output (`packages/domain/src/primitives/plural.ts`, added E2) across every noun form it composes — verified mechanically (`Intl.PluralRules('uk')` boundaries, tested at 1/2/5/11/21/22) but not by a native speaker, and animate feminine nouns plus accusative government under case-governing verbs ("Знайдено" vs "Підходить") is not something rule-reasoning alone reliably gets right | 4 |
| H3.5 | Perf pass — **addition**, sits here rather than V2 or its own phase because all three items bundle naturally once H3 lands: e-Ukraine subsetting (Cyrillic + Latin basic + punctuation; deferred from V2 specifically because the glyph set isn't final until H3's English strings and native-speaker Ukrainian pass exist — and stays generous even then, since a shelter's free-text `freshnessSentence` isn't a set anyone controls, so this subsets to a wide net rather than a tight one), the `next/image` `sizes` attribute overshoot, and the image-loading priority heuristic. 95 KB across three weights isn't worth a dedicated pass on its own; bundled with the other two, it is | 3 |
| H4 | PWA — Serwist, manifest, offline shell, Lighthouse pass | 8 |
| H5 | Observability + legal — Sentry, PostHog, privacy policy (GDPR), consent handling, e-Ukraine's CC BY 4.0 attribution (licence file + user-reachable credit — should already exist from V2; this is the launch-readiness check that it's still there and still correct, not the first time it's added) | 10 |
| H6 | Real shelter data + soft launch — onboard 5–10 shelters, verify each through the FSM, spot-check every listing | 12 |

**Total: ~59 h** (50 h original + the admin desktop-layout addition + the H3.5 perf pass).

**Done when:** matches the original M7–M12 definitions of done, unchanged — one uploaded
photo produces all variants and renders through the CDN; a shelter and its animals can be
added and verified without touching SQL; locale switch preserves route and state; the app
installs on Android with Lighthouse ≥90; a thrown error appears in Sentry within a minute;
5+ verified shelters and 50+ live animals at soft launch.

---

## Part 3 — Timeline

The **Hours** column is a relative-complexity signal, not a schedule. These figures were estimated
as solo human effort at 8–10 h/week; phases are landing in a fraction of that wall-clock time.
What sets the calendar is review bandwidth and shelter recruitment — not the hour totals.

| Phase | Weeks | Hours |
|---|---|---|
| C — Consolidate | — | 0 (done) |
| E — Gallery | 4–5 | 57 |
| F — Detail & reveal | 3 | 24 |
| G — Deck completion | off critical path | 13 |
| H — Remainder to launch | 7 | 59 |
| **Total from this rewrite** | **~16 weeks** | **~153 h** |

At 8 h/week of code and 2 h/week of shelter recruitment, **soft launch still lands early
February 2027** — the total dropped from ~135 h to ~127 h (C fully closed out, E gaining
E5's 3 h), but ~1 week at this pace doesn't move a ~16-week estimate expressed in weeks.
The arithmetic: the course correction's 148 h, minus the ~34 h of Consolidate now fully
spent and landed (C1–C7, all seven tasks) and the 8 h design pass 2, plus the ~21 h this
rewrite and its implementation add (E0's contract and schema work — including the
`reserved`/`publishedAt` domain change and backfill and the second wait-anchor index, both
settled during the gallery-contract decision round — E5's view-mode switch moved in from
C7, and the admin desktop layouts) — 127 h. E1.5's addition (3 h, see Phase E above) brings
this to 130 h, and E2.5's addition (3 h, also Phase E above) brings it to 133 h — same
reasoning both times: ~16 weeks at this cadence absorbs a few extra hours without moving
the week count.

**Phase V's addition (12 h, V1+V2 above) does not fit that same "absorbed, week count
unmoved" reasoning, and is not claimed here as if it did.** 12 h at 8 h/week of code is
~1.5 weeks — the two prior 3 h additions were each ~0.4 week, comfortably inside a "~16
weeks" figure's own rounding; 1.5 weeks is not. **145 h ÷ 8 h/week ≈ 18.1 weeks of code
time alone** for the critical path (C+E+F+H — G stays off it, per its own header, both
before and after G4), before the same rough-estimate slack the rest of this document
carries. G4's own 3 h (deck gesture-physics re-skin, moved out of V2) brings the grand
total including the off-critical-path phase to 148 h, but doesn't change that 18.1-week
figure — G was already excluded from the critical-path week math, and stays excluded.
Whether the 12 h Phase V addition actually moves the project's week estimate past "~16
weeks" — and if so, by
how much — is a real re-plan question this document is not settling here; V1's intake
report is the next input into that question, not this arithmetic update.

**H3.5's addition (3 h, Phase H above — the e-Ukraine subsetting/`sizes`/priority-heuristic
perf pass, moved out of V2 for the reason recorded there) brings the critical path to
148 h ÷ 8 h/week ≈ 18.5 weeks, and the grand total including G to 151 h.** Same reasoning
as E1.5/E2.5's additions: absorbed inside the existing rough-estimate slack, not a figure
this document claims moves the ~16-week estimate on its own.

**F6's addition (2 h, Phase F above — screen 07's exhausted state, newly owned now that the
addendum gives it a mock; see "Why there's no Phase V3" in Phase E) brings the critical path
to 150 h ÷ 8 h/week ≈ 18.75 weeks, and the grand total including G to 153 h.** Same
reasoning again: this is new scope the addendum surfaced, not scope moving from a
Phase V3 that never had its own hour line to begin with — there is nothing to subtract
elsewhere in this ledger to offset it.

**The actual gate on launch date has not moved and is not code:** 5–10 verified shelters
in Kyiv oblast with photographed, described animals, each shelter having written its own
`freshnessSentence`. Shelter #1 fully verified with ten photographed animals was a week-6
milestone in the original plan and remains outstanding.

---

## Part 4 — Standing decision points

Carried forward from the original plan, still undecided by design (decide at the stated
moment, not now):

| Decision | Decide at | Default if you don't |
|---|---|---|
| oRPC 1.x → 2.0 migration | When 2.0 hits stable and you're between phases | Stay on 1.x — all contracts live in one package, so migration stays a one-package job |
| Add Turborepo | When CI exceeds ~3 min | Stay on plain pnpm workspaces |
| Enable PostGIS | When real city-adjacency or radius search is needed (see `docs/gallery-contract-decisions.md` §4) | `city_id` FK + centroid only |
| Extract `apps/partner` from `apps/web` | When a shelter asks for dashboard access **and** ≥15 shelters | Route group inside `apps/web` |
| Adopter accounts | When someone asks for reveal history across devices | Anonymous session, upgradeable (Better Auth deferred to shelter accounts) |
| Redis for the seen-set | When the array-column query shows up in slow logs | Postgres array column |

**Never cut, regardless of schedule pressure:** the exhaustive FSM test, the freshness
display, keyset pagination for the deck, seed-data volume, the verification gate
(`next build` + the harness in `pnpm check`). Each is cheap now and expensive to retrofit.
