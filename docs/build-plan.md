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

**`pnpm check` wall time:** **2m46s** (166s), measured 2026-09-10/11 on the dev machine —
`{ time pnpm check ; }` wrapping the whole pipeline (typecheck → lint → test → build:web →
test:harness), warm `node_modules`, warm Postgres via `docker compose`, cold Next.js build
cache. Supersedes the 119s figure below: that number came from a run contaminated by a second
`pnpm check` running concurrently against the same local Postgres and the same harness port —
two processes racing the same database mid-migration produced a real, silent skew, not a typo.
This number is from an isolated run, nothing else touching the DB or ports 3100–3200
simultaneously — see `docs/standing-constraints.md`'s "Local Postgres and Neon are not the
same database" for the adjacent, not identical, lesson (two *different* databases disagreeing
vs. two runs against the *same* one colliding). Not remeasuring this again unless the pipeline
itself changes shape — per Oleksii, it isn't the bottleneck.

~~119 seconds, measured 2026-09-09~~ (superseded above) — `date +%s` before/after rather than
`time`, and not isolated from concurrent runs the way the figure above was.

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
| E4 | Empty (no-match, already built in V2 — this row is the remainder), error (**one state**, not the design's stated whole-list/next-page pair — pagination is plain link navigation per `docs/gallery-contract-decisions.md` §7, so a failed next page and a failed first load are the same event to this app's router; the "Next-page error" frame is marked NOT REACHABLE, not deferred, in `docs/design/README.md`), out-of-range page (200, last valid page, **the note must actually render** — see the phase's own done-when below, not just the copy existing) states — built in the «Реєстр» language directly (`docs/design/README.md`'s "States and remaining screens", frames E1/E2, P1/P2). Loading (L1/L2) was investigated and NOT built this phase — Next's route-level `loading.tsx` puts the whole route into streaming SSR unconditionally, and the inline script that swaps the hidden real content in for the fallback is itself JavaScript, so a no-JS visitor never sees the swap and is stuck on the skeleton permanently; four no-JS harness tests failing on the attempt confirmed it. A correct version is client-driven (`useLinkStatus`/`useTransition` around the existing link-interception points, never a Suspense boundary) — real new scope, tracked against E5, not this row's remaining hours | 4 |
| E5 | Gallery ↔ deck view-mode switch — moved here from C7 (`docs/build-plan.md`'s Phase C correction): a control with only one working destination isn't buildable before this phase. Real scope turned out much larger than "chrome": no browser-side oRPC client existed yet, `/discovery` still ran entirely on mock data, and no gallery-side entry control existed at all. Built: `/tvaryny/gortaty` as the deck's real, `noindex` route on real `feed.list` data (browser-side oRPC client, cursor/prefetch, `useFeedDeck`); the gallery's own entry control (desktop header + mobile row, hidden when there are zero matches); exit ("До списку" / Esc / browser back — genuinely one mechanism, `router.back()` when a same-tab marker confirms it's safe, else a fresh gallery link) with scroll-restore coming from the browser's own history mechanism, not custom bookkeeping; the inherited-filters header phrase and position/progress counter (carried-over total, since `feed.list` has no count of its own). Also investigated and resolved: the E4-carried "header/rail stay usable during an error" gap — found the guessed fix (a `layout.tsx` split) structurally impossible (layouts can't read `searchParams`) and, separately, not actually useful (a filter rail doesn't help when the failure is backend-side); shipped a real escape hatch instead (a link to the bare, unfiltered gallery) — see `docs/design/README.md`'s "Whole-list error" section. A second, sibling gap found during review and fixed the same way: `/tvaryny/gortaty` had no `error.tsx` of its own, so a failure in its own `cities.list()` call fell through to the *gallery's* error boundary and rendered filter-specific copy for a deck failure — given its own `error.tsx` now, reusing the deck's existing `uk.errors.loadFailed` copy. The client-driven pending indicator (`useLinkStatus`/`useTransition`) this row's earlier text also carried over from E4 was **not built** — real scope of its own, still a follow-up, not folded in here. Also not built, recorded as deviations rather than dropped — see `docs/design/README.md`'s "Gallery ↔ deck" section: the `sessionStorage`-persisted "last mode" this row originally named (**unmet definition-of-done, with a product decision recorded, not a deferred nice-to-have** — see that section), and full filter-*and*-sort inheritance (`feed.list` has no `sort` parameter today — a missing contract field E5 chose not to add, not an architectural block; see that section for why the header's omission of sort is clean rather than misleading) | 3 |

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
| ~~G3~~ | ~~Promote the deck from `/discovery` to its real route...~~ **Done — built by E5, not G**, found while E5 checked what "the deck's own entry/exit chrome" actually required rather than assuming G3 owned the route. `/tvaryny/gortaty` (`noindex`), the gallery's entry control, and exit (`router.back()` when safe, else a fresh gallery link, scroll position coming from the browser's own history mechanism) are all real and shipped. **Filters inherited, sort is not** — `feed.list` has no `sort` parameter, recorded as a deviation in `docs/design/README.md`'s "Gallery ↔ deck" section. Not a G3 pickup either way: not because there's no sort concept to receive, but because adding one is a `packages/contracts` change (a gate stop), and no phase currently owns deciding whether it's worth making. | ~~3~~ |
| G4 | Deck gesture-physics re-skin — the new handoff's motion values (`docs/design/README.md`, "Geometry, density, elevation, motion": quick 120ms / settle 220ms / reveal 280ms, `cubic-bezier(0.3, 0, 0, 1)`; release spring stiffness 280 / damping 30, no overshoot) applied to `use-swipe-gesture.ts`'s own constants — moved out of V2 deliberately (`docs/build-plan.md`'s Phase E table, V2 row) so these values change once, alongside whatever G1's iOS investigation also touches in the same file, not twice | 3 |

**Total: ~10 h** (13 h original, minus G3's 3 h — already spent as part of E5's own overage, not double-counted here; see `docs/build-plan.md`'s Part 3 ledger).

**Done when:** 30 uninterrupted swipes on a real mid-range Android and a real iPhone,
entered from and returning to the gallery at the same scroll position and card, on the new
motion values.

**Decisions this phase must surface:** none anticipated for G1–G2 — flag if the iOS
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
| H2 | Internal admin — animal/shelter CRUD, CSV import, **desktop layouts** (addition — the original plan assumed a single admin form factor). ⚠ **Read `docs/standing-constraints.md`'s "Commitments the «Для притулків» page makes" first.** `/prytulkam` tells shelters they will never be told that someone looked at a card. `reveals` already stores `(adopter_id, animal_id, shelter_id, revealed_at)` **indexed on `shelter_id`**, so an engagement tile here is one query, not a migration — this is the row where that commitment breaks by accident | 12 |
| H3 | i18n — next-intl wiring, uk + en message files, full-ICU boot assertion. Also: native-speaker review of `pluralizeUk`'s output (`packages/domain/src/primitives/plural.ts`, added E2) across every noun form it composes — verified mechanically (`Intl.PluralRules('uk')` boundaries, tested at 1/2/5/11/21/22) but not by a native speaker, and animate feminine nouns plus accusative government under case-governing verbs ("Знайдено" vs "Підходить") is not something rule-reasoning alone reliably gets right | 4 |
| H3.5 | Perf pass — **addition**, sits here rather than V2 or its own phase because all three items bundle naturally once H3 lands: e-Ukraine subsetting (Cyrillic + Latin basic + punctuation; deferred from V2 specifically because the glyph set isn't final until H3's English strings and native-speaker Ukrainian pass exist — and stays generous even then, since a shelter's free-text `freshnessSentence` isn't a set anyone controls, so this subsets to a wide net rather than a tight one), ~~the `next/image` `sizes` attribute overshoot~~ (**done** — H1's real-R2 verification pass measured it as a live 2.1× overfetch on phones rather than a theoretical overshoot, and it was fixed in #48 and #50 with a variant-selection harness lock; nothing left here), and the image-loading priority heuristic. 95 KB across three weights isn't worth a dedicated pass on its own; bundled with the other two, it is | 3 |
| H4 | PWA — Serwist, manifest, offline shell, Lighthouse pass | 8 |
| H5 | Observability + legal — Sentry, PostHog, privacy policy (GDPR), consent handling, e-Ukraine's CC BY 4.0 attribution (licence file + user-reachable credit — should already exist from V2; this is the launch-readiness check that it's still there and still correct, not the first time it's added). Vercel Analytics + Speed Insights landed early, in Phase F — see `docs/stack-decision.md`'s "Amendment, Phase F" note; this row still owns the privacy policy and consent handling that should have accompanied them | 10 |
| H6 | Real shelter data + soft launch — onboard 5–10 shelters, verify each through the FSM, spot-check every listing | 12 |

**Total: ~59 h** (50 h original + the admin desktop-layout addition + the H3.5 perf pass).

**Done when:** matches the original M7–M12 definitions of done, unchanged — one uploaded
photo produces all variants and renders through the CDN; a shelter and its animals can be
added and verified without touching SQL; locale switch preserves route and state; the app
installs on Android with Lighthouse ≥90; a thrown error appears in Sentry within a minute;
5+ verified shelters and 50+ live animals at soft launch.

---

### Phase T — Trust and wayfinding

Added after the post-Phase F design and copy critiques (`docs/design-critique.md`,
`docs/copy-and-ia-critique.md`). Not a polish phase, and the distinction is the whole
reason it exists: of eighteen findings across both documents, almost nothing that was
*built* is wrong — the reveal modal matches its mock down to the shadow value, touch-target
spacing is clean, register is consistent, every error state pairs what happened with what to
do. The findings that matter are about **surfaces that do not exist**. This phase builds
them.

It sits before **H6** (real shelter data + soft launch), not after. H6 is the point where a
volunteer is emailed a link, and T2 below is the page that link goes to.

| # | Task | h |
|---|---|---|
| T1 | A header on every user-facing surface except the deck, carrying the wordmark and links to «Про проєкт» and «Для притулків». Closes critique E5 (the about page was linked from exactly one place in the whole app), E1 (a shared detail-page link arrived with no brand and no route to context), B2 (the detail header dropped the wordmark, contradicting mock D1) and E7. Takes the header to the design's own 64/88 heights in the same component (A2). **Deliberately not the deck** — `docs/design/README.md:589` states the deck's header replaces the gallery's, "never two navigations at once" | 3 |
| T2 | «Для притулків» — the first surface in this project written for shelters rather than adopters, and the page an outreach message links to. Closes E3. Structure and argument in `docs/prytulkam-argument.md`; the Ukrainian is written from that structure, not translated from it | 4 |
| T3 | A1 — reset the gallery card name to display-s (24/28) at desktop and wide. The compact 22/26 belongs to the 600–1023 horizontal card only, and was never un-set | 0.5 |
| T4 | D1 — remove `pagination.footnote`, the product explaining its own engineering to an adopter who did not ask. `noMatch.suggestionExplainer` was **kept**: the critique described both as stray doc-comment text, but that one is verbatim mock copy (`Opika Registry System.dc.html:275`, frame B4), so cutting it would have been a design override rather than a copy fix | 0.5 |
| T5 | C1 — one 25+ character animal name and one long shelter name in the seed corpus, so truncation is exercised near its limit permanently rather than by a manual check nobody repeats | 0.5 |

**Total: ~8.5 h.**

**Done when:** every user-facing surface but the deck carries the wordmark and both nav
links, measured in a real browser; the header meets 64/88; a shelter can read what joining
involves, what verification means, and what to prepare, without emailing first; the card
name is 24/28 on every vertical card; and the seed corpus contains a name long enough to
make `truncate` engage.

**Explicitly not in this phase, accepted rather than deferred** — recorded so they are not
rediscovered as new findings: A4 (0.2px of tracking at 44px), A3 (desktop padding 60px vs
the spec's 32px — document whether it was intentional, then leave it), B1 (grid row-stretch
whitespace, an observation), B3 (the first-run band above a zero-result state — revisit if
the no-match state is touched), C4 (the Ukrainian "11" plural boundary was unreachable on
the live corpus; `packages/domain`'s own tests cover it), D3 (`freshness.attribution`'s
middot-joined fragments — folds into H3's native-speaker pass), E4 (no report-a-stale-listing
path; with five shelters the maintainer *is* the reporting channel), E2 (downstream of E1).

**Checked, not fixed, and paired with real work rather than manufactured:** C6 — the detail
page's photo crop against real source aspect ratios. It concerns photographs of animals,
which is the product, and it is genuinely unverified. It becomes checkable the moment a real
shelter's photos land, so it belongs to the first onboarding (H6), not to a pass that would
need invented test images.

**Not in this phase, pending a measurement:** C7 — dark mode is fully specified in
`docs/design/README.md` (8 tokens, each with a measured contrast ratio) and entirely
unimplemented; there is no `prefers-color-scheme` or `dark:` rule anywhere in `globals.css`.
The critique established that the media query never fires, which is *not* the same as
establishing severity: Android Chrome's Auto Dark Theme does not read that query, it
actively rewrites colours on pages that do not declare dark support, and it handles a warm
cream ground (`#ECECEA`) worst of all. So the real question — "some users see a light page"
versus "some users see a mangled page" — is unanswered until it is checked on real Android
hardware with forced dark mode on. That check gates whether this is a phase or a shrug.

---

### Phase D — Demo honesty

Production is publicly reachable and holds 320 fabricated animals from fabricated shelters,
unlabelled, while `/prytulkam` opens with «реєстр тварин із перевірених притулків». A shelter
volunteer can open the site before replying to an outreach message and see a registry of
animals that do not exist. This phase does not remove the demo data — it labels it,
de-indexes it, and makes the seeded corpus varied enough to actually test the surfaces it
exercises, rather than remaining a well-behaved fiction that never breaks anything.

Planned in a working session whose transcript, not this document, was its only record until
now — written down here per `docs/standing-constraints.md`'s "check a document's claims
before relying on them" and "one document per subject," after `opika-reviewer` correctly
flagged every `D-#` code comment referencing a plan that didn't exist in `docs/`. Hours were
not estimated per row in the original brief; none are given below rather than invented.

Three rows (DECK-1 through DECK-3) were carved out first and already shipped, because D-2's
banner needs a deck with spare height budget and the deck had none — see their own commit
messages and `docs/design/README.md`'s text-scaling-gap section for the full record.

**Reprioritised, 2026-09-06 — reduced scope, recorded as a decision, not drift.** This
phase's opening paragraph argues from a shelter volunteer opening the site before being
told what it is. That premise no longer holds: Oleksii has decided no outreach happens
until the MVP gate, and the site is `noindex`ed and not publicly discoverable
(`SITE_IS_PUBLICLY_DISCOVERABLE = false`, Part 5's "Before any route is indexed"). Nobody
arrives. The disclosure work that actually answered the original argument — the demo
banner, the metadata swap, the two-constant flag split, `robots.ts` allowing crawl so the
`noindex` can be seen at all — is done, on PR #53, D-1/D-2/D-3. What remained splits into
three different kinds of work, and only two of them earn time before the gate:

- **Data protection** (D-9) is real regardless of who can see the site — a stray
  `pnpm db:seed --force` truncating a database that by then holds a real onboarded shelter
  is unrecoverable, and that risk doesn't wait for launch. **Kept, reduced.** The marker
  column + migration this row originally specified is dropped; the same protection is
  built directly into `seed.ts`'s existing localhost check, twenty minutes instead of a
  migration. See the row below for the exact mechanism.
- **UI test data** (D-4, D-6) makes rendering problems visible *now*, while the product is
  still being judged and iterated on. The current corpus is well-behaved, which is
  precisely why it never breaks in front of Oleksii — a hostile corpus and real awkward
  photographs are the actual finding-generator D-4/D-6 always were, independent of who is
  or isn't looking at production. **Kept, reframed as local-only.** Nothing here runs
  against a production connection string; `pnpm db:seed` already refuses a non-localhost
  target (and D-9 below hardens exactly that check), so this was never at risk of touching
  production, but it's stated here explicitly rather than left implicit.
- **Paperwork for a transition that is weeks away** (D-5's placeholder-contact format, D-7's
  transition procedure) has no audience to protect yet — a fake phone number on a page
  nobody but the maintainer can reach harms no one. Writing it now would be effort spent
  against a target that will have moved by the time it matters (D-5's own placeholder
  *format* is a real open design decision — see below — and deciding it eight weeks before
  it's load-bearing risks deciding it twice). **Both deferred**, not dropped: moved to a
  single build-plan row each, due in the hour before `SITE_IS_PUBLICLY_DISCOVERABLE` is
  flipped (Part 5), so the obligation is recorded rather than quietly lost. See D-5 and D-7
  below for the exact deferred scope.

**D-0 comes off the critical path.** It previously blocked D-6, D-9's live verification,
and D-7's rehearsal. With D-6 reframed as local-only, D-9 reduced to a code check verified
against a real *local* database (no live/production verification needed), and D-7 deferred
past this phase entirely, nothing left in this phase's scope needs D-0 done first. It
remains Oleksii's own action item, on his own timeline, blocking nothing here.

**What this changes about the phase's own "Done when," below:** demo-corpus honesty
(labelling, de-indexing) is fully done; the "hostile enough to exercise every rendering
edge case" half of the original criterion is still being pursued (D-4/D-6, now local-only);
the "documented, guarded procedure" half for the demo-to-real transition is deferred with
its own due point, not met by this phase.

| # | Task | Status |
|---|---|---|
| DECK-1 | Invert what the deck's card yields under height pressure — the photo shrinks (to a documented floor), never the shelter-line text. Recovered −22px (320×640) and 0px (360×640) margins to 12px everywhere | **Done** — #52 |
| DECK-2 | The deck's three 44px touch targets (back-to-list, gallery's mobile deck-entry, error-state retry) raised to 48px, plus the retry button's missing focus ring. Cost lands on photo height (DECK-1's slack) at every 640-tall viewport; at 390×844 the photo is already pinned at its `max-h-99` ceiling and can't absorb, so there the 4px comes off the shelter-line margin instead (20 → 16, still clear of that viewport's floor) | **Done** — #52 |
| DECK-3 | Record, not assert, that Android text-scaling is unverifiable in the Playwright harness (`-webkit-text-size-adjust` has no effect in desktop Chromium) | **Done** — #52 |
| D-0 | Remove the production `DATABASE_URL` from Oleksii's persistent Windows environment. **Blocks:** nothing in this phase as of the 2026-09-06 reprioritisation (see above) — D-6 is local-only, D-9 is verified against a local DB, D-7 is deferred past this phase | Open — Oleksii's, off the critical path |
| D-1 | Two constants, not one: `REGISTRY_HAS_NO_REAL_SHELTERS` (drives the demo banner, `firstRun.promise` swap, `shelterVerifiedYears` badge suppression — all D-2) and `SITE_IS_PUBLICLY_DISCOVERABLE` (drives `X-Robots-Tag` and, since D-3, the root-layout `robots` metadata — `robots.ts` itself no longer reads either flag), plus `assertDemoDiscoverabilityInvariant`, thrown only if both are true and permitting the launch-gate window below where real shelters predate public discoverability. The real day-to-day gate is `seo-flags.test.ts` catching that combination in CI on the real constants before either reaches a deploy; the runtime call from `instrumentation.ts` is defense-in-depth, not a verified hard boot refusal — a throw there follows `validateEnv()`'s own documented behaviour (`apps/web/src/api/env.ts`: per-request 500s, not a stop). A single flag shipped first (#43) and was reverted here after `docs/standing-constraints.md`'s "two facts" entry — see that entry and this row's own history for why | Done |
| D-3 | Add `robots` to root-layout metadata; drop `Disallow: /` from `robots.ts`. `Disallow: /` stops a crawler fetching pages at all, so it never reads a page's own `noindex` meta or the `X-Robots-Tag` header — an already-indexed URL can't be de-indexed without the crawler visiting it, which `Disallow: /` itself prevents. Root-layout metadata avoids that trap. **Depends on:** D-1 | Done |
| D-2 | Compact demo notice inside the deck's existing header row (replace, don't add — zero new height) plus the `firstRun.promise` swap and `shelterVerifiedYears` badge suppression. Ukrainian ships real text, pinned empty of `[COPY PENDING]` by `copy-status.test.ts`. **Depends on:** D-1 | **Done, 2026-09-06 — Ukrainian landed, nothing renders a marker anywhere.** Decided (Oleksii, Phase D decisions): the deck notice (`uk.demo.deckLabel`, «Демо») replaces only `filtersLabel` — the position count stays (demo mode is the whole testing period; a deck missing the count for weeks isn't the deck being tested); the progress bar degrades instead, hidden unconditionally whenever the notice shows, which is what buys it its width. Recorded as a Phase D deviation in `docs/design/README.md`'s deck-chrome section. Width budget measured before the copy landed, bar hidden: tightest at 320px (~107px available), a 12-character label fits, 14 clips — «Демо» (4 characters) is nowhere near that ceiling; geometry re-asserted since at four viewports by the harness against the real shipped string (`discovery-layout.harness.ts`'s "demo banner" block). **Amendment to the original `og:description` decision:** it said omit entirely rather than render `[COPY PENDING]` — a fallback for having no honest string. With `uk.demo.bannerNotice` real, the root layout defaults to it as the description while the flag is true; the detail page's not-a-judgement notice (recovered verbatim, «просто» included, from the deleted `firstRun.disclaimer` — not this document's own D-3 row, an unrelated robots-metadata task — see `docs/observations.md`) is also real and live now. **Provenance:** `uk.demo.bannerNotice`/`uk.demo.deckLabel` (renamed from `promise`/`bannerNotice` on 2026-09-06 — the original names described each other's contents, not their own) were drafted by Claude from an English sense; Oleksii selected these from offered options on 2026-09-05. The notice's «просто» clause was briefly dropped by an unapproved Claude edit and reverted; the shipped sentence is Oleksii's own pre-existing copy, reproduced verbatim, needing no fresh approval. Full record in `docs/observations.md`'s O-3 section. **Route scope (Option B, 2026-09-06):** the root layout's description swap is a default every route inherits unless it overrides — `/tvaryny/[animalId]` overrides with its own per-animal swap (its `generateMetadata` didn't inherit the root's default at all; Next overrides route metadata rather than merging it, so this was fixed in the same pass, asserted in `seo-flags.test.ts` for both flag states); `/prytulkam` and `/pro` override with their own existing opening sentences (`uk.forShelters.whatThisIs`, `uk.about.intro`) instead of the demo swap — that disclosure was never meant to reach those two specifically. **Badge positive control (PR #53 review):** the harness only ever checked the badge's suppressed state, an absence check with no proof the assertion would catch the badge's JSX being deleted outright rather than gated — `AnimalDetailScreen.test.tsx` (new) exercises both flag states directly, mutation-confirmed both directions (deleting the badge, and inverting the condition) |
| D-8 | Make the image path honest in dev/test: no `.env.local`/R2 credentials, every route still renders. **Blocks:** D-4, D-6 | **Done, 2026-09-06 — already true of the shipped H1 code, verified rather than assumed.** `image-loader.ts`'s `isRealPhotoKey` gate only routes the `animals/` namespace through the R2 CDN URL; `packages/db/src/seed.ts`'s fictional corpus stores plain `seed-photos/*.jpg` keys, which fall through to the pre-H1 root-relative path unconditionally — already unit-tested in `image-loader.test.ts`. What hadn't been checked with a real build: `apps/web/.env.local` was renamed aside (no R2 var anywhere in the shell either), then `pnpm build:web` and the full `pnpm test:harness` (171/171, every route including `/tvaryny/[animalId]`) were run against that real build and passed — `.env.local` restored unread afterward. CI already exercises this on every run without knowing it: no workflow secret ever sets an R2 var and no `.env.local` exists in a checkout, so `build:web`/`test:harness` going green in CI *is* this row's regression guard going forward, not merely an accident of the sandbox this was checked in |
| D-9 | **Reduced, 2026-09-06 (see above) — no marker column, no migration.** `seed.ts`'s `assertSafeSeedTarget` refuses any non-localhost target outright, full stop; the only override is `--force` **and** `--db-name=<name>` together, the name read out of `DATABASE_URL` itself and matched exactly — `--force` alone is no longer sufficient. Same protection against truncating a database holding a real shelter as the original marker-column design, in a function instead of a migration and a backfill. **Verified against a real local database, not by reading the code:** `localtest.me` (public DNS, resolves to `127.0.0.1`) reaches the same local Postgres without textually matching localhost — proved refused-then-allowed against it, animal count checked before and after each run. **Mutation-tested**, not just unit-tested: the guard's body was temporarily neutered (a one-line `return;`, via `sed`, never through the linted `Edit` path, reverted immediately after) and the exact previously-refused command was re-run — it proceeded and truncated, confirming the guard itself was what had been stopping it. **`opika-reviewer` caught a real hole in the first version, not a style note:** the initial `isLocalhost` check tested `/localhost\|127\.0\.0\.1\|0\.0\.0\.0/` against the *whole connection string*, a substring test satisfiable from inside a password, database name, or query parameter — the reviewer constructed `postgres://opika:pass_localhost_x@db.neon.tech/opika_prod` and confirmed it truncated a real database with **zero flags**. Fixed to an exact match on `new URL(databaseUrl).hostname`; re-verified with the reviewer's own exploit string against the real local database (refused, exit 1, row count unchanged) before this row was marked done. Also fixed: an empty `--db-name=` no longer trivially matches a pathless `DATABASE_URL`'s own empty database name. **Round 2 of review** found the first fix for that second issue left one of its two length checks unmutation-pinned (removing `actualDbName.length > 0` alone still passed all 11 tests); simplified to the single clause that's actually load-bearing and confirmed by deleting it that the exact test built to catch this now goes red. 11 unit tests (`packages/db/test/seed-safety.test.ts`) cover the full matrix, including the reviewer's hostname-substring exploit as a permanent regression test. **One low-severity item accepted, not fixed:** a malformed multi-host `DATABASE_URL` (e.g. `postgres://a:5433,b:5432/db`) throws an unhandled `TypeError` from `new URL()` instead of the guard's own error message — fails closed (nothing truncates, since the throw happens before any connection is opened), message quality only, not pursued further per the loop's two-review-round cap | Done |
| D-5 | **Deferred, 2026-09-06 (see above) — dropped from this phase, not from the plan.** Every demo shelter's contact is a clearly-marked placeholder sentinel; no invented phone number or handle anywhere in the corpus. Moved to Part 5's launch gate as its own row, due in the hour before `SITE_IS_PUBLICLY_DISCOVERABLE` is flipped — see that section. The exact placeholder *format* (an obviously-fake number pattern vs. a real-shaped number with a visible marker suffix vs. something else) is still an open design decision, deliberately not settled here: deciding it now, weeks before it's load-bearing, risks deciding it twice | Deferred to Part 5, before public discoverability |
| D-4 | Hostile corpus: registered/unregistered legal forms, with/without donation link, a wrapping shelter name, no freshness sentence, 0/1/6-photo animals, a wrapping animal name, no description, unknown vaccination, one reserved-and-listed, freshness anchors spanning all three pip states on one page. **Reframed, 2026-09-06:** this is UI test data, not demo hygiene — it makes rendering problems visible now, independent of who can reach the site. Local-only; no production connection string ever touched. **Depends on:** D-9 (safety-ordering only — D-4 runs against the same local DB D-9 hardens, not a hard blocker); D-5 dropped as a dependency (contact-format honesty is unrelated to corpus shape). **Audited against the shipped corpus before writing anything** — most of this list was already true: donation-link variance, no-freshness-sentence, the wrapping shelter/animal names (Phase T, C1), and unknown vaccination (30% of animals, `roll >= 7`) all pre-existed, but **had zero test coverage anywhere** (caught on review — see below). "Reserved-and-listed" is structural, not seed-data — decision #16 keeps every reserved animal in the feed by construction, nothing to add. What was genuinely missing, built and **verified against the real local database, not by reading the code**: (1) legal-entity variance — every one of 8 shelters was `registered_ngo`; one (`Притулок «Вірний друг»`) is now `unregistered_initiative`, `ShelterLegalEntitySchema`'s third variant. **Narrowed on review:** this does *not* exercise CLAUDE.md decision #6's verification-policy pathway — `buildVerification` constructs every shelter's `verified` status directly with an empty `evidence.items`, never consulting `meetsEvidenceRequirements`, and nothing in `packages/contracts`/`apps/web` reads `legalEntity` at all today (`PublicShelterViewSchema` omits it). What's true, no more: the corpus holds a non-registered legal entity for the first time, ready as a fixture for whenever onboarding/H2 work needs one — `select legal_entity->>'kind', count(*) from shelters group by 1` confirmed 1/7 after reseeding; (2) a *published* (non-draft) animal with 0 photos and one with 6 — the old formula gave 0 photos only to drafts and capped at 5; two fixed indices (`ZERO_PHOTO_PUBLISHED_INDEX`/`SIX_PHOTO_INDEX`) override it, confirmed present by a direct `jsonb_array_length(photos)` query (the six-photo animal is a dog and `DOG_PHOTOS` has 5 entries, so it's a duplicate-photo case too, noted in the comment rather than padding the pool to hide it); (3) a minimal one-line description ("Опис відсутній.") on one animal — `Animal.description` is `LocalizedTextSchema`, `uk: z.string().min(1)` required, so a genuinely empty description isn't a constructable `Animal` at all; this is the closest honest domain-valid representation of "no description," not a schema change nobody asked for. **Freshness-anchors-on-one-page was checked, not assumed, and turned out to already be true**: filtering by city (Вишгород, index 4 — a real, reachable `?misto=` filter, not an invented mechanism) yields discoverable animals (published + reserved, verified shelters only — the real feed predicate, not a stand-in) spanning fresh/aging/stale simultaneously, well under one gallery page — found by querying the real per-city freshness-bucket breakdown before writing any new code. **Two review rounds caught real issues, both fixed:** round 1 — the legal-entity construction was a ternary chain defaulting silently to `registered_ngo` for any unhandled kind, and `legalEntityKind` was a hand-copied literal union rather than `ShelterLegalEntity["kind"]` itself, so the "exhaustive switch" it was rewritten into (matching `buildVerification`'s own compiler-guided switch) wasn't actually exhaustive against the real schema — confirmed both ways by round 2: adding a fourth schema variant now fails this file's own build (`Type '"municipal_shelter"' is not assignable to type 'never'`), reverted after confirming. Also round 1: four of the five already-true items (no freshness sentence, no donation link, unknown vaccination, the long shelter name) had zero test coverage anywhere. **Correction from round 2:** the fifth, the long animal name, already had real coverage — `apps/web/test/harness/site-header.harness.ts`'s "a name long enough to need it exists in the corpus and is actually clipped" dynamically finds it across 10 gallery pages and asserts both existence and clipping, stronger than a corpus-level presence check. Its new unit-test pin here is a deliberate, faster-failing duplicate (1s, no database, no build), not new coverage — kept for that reason, not because the coverage gap was real. All of it — the 4 built cases, the 1 discovered case, and the 5 already-true items (4 newly pinned, 1 already covered by the harness and now double-pinned) — sits in `packages/db/test/seed-corpus.test.ts`, 10 fast unit tests calling `buildShelters`/`buildAnimals` directly, no database, so a future formula change can't silently break any of them | Done |
| D-6 | 5–6 real CC0/public-domain photographs through the R2 pipeline, provenance recorded per file, no operator-identifying EXIF/IPTC, at deliberately awkward ratios (9:16 screenshot, 16:9, EXIF-rotated, ~400px, ~4000px) — feeds O-10 and critique-item C6 (detail-page photo crop; see Part 2's Phase T, "checked not fixed" — not build-plan's own, unrelated C6 in Phase C). **Reframed, 2026-09-06: local-only, D-0 dropped as a dependency** — the corpus and the Postgres side of this run entirely against a local DB. Licensing discipline unchanged: strict CC0/public domain, provenance recorded per file, EXIF **and** IPTC stripped and verified with `exiftool`; if a licence can't be established from the source page itself, the image is discarded. **Real open gap, not yet resolved:** the actual R2 upload step needs write credentials (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`), which by `.env.example`'s own section 2 policy are never saved to a file and belong to an operator's own machine — there is no separate dev/demo bucket documented anywhere, only the one bucket `onboard-shelter.ts` targets. Sourcing, provenance recording, and EXIF/IPTC stripping can all happen without them; the upload itself needs either Oleksii running it with his own credentials against the prepared image set, or a deliberate decision to provision a second bucket so demo photos never share storage with a future real shelter's. **Depends on:** D-9 (safety-ordering only) | Untouched |
| D-7 | Write the demo-to-real transition into `docs/standing-constraints.md` and the onboarding checklist: wipe before the first `onboard-shelter --commit`; the banner (`REGISTRY_HAS_NO_REAL_SHELTERS`) comes down when the wipe happens, separately from noindex (`SITE_IS_PUBLICLY_DISCOVERABLE`), which stays down through the launch-gate window until the site is actually meant to be found — the two do **not** come down together, that is the whole point of D-1's two constants; why `robots.txt` allowing crawl is deliberate; the coexistence window named as the point of maximum danger. **Deferred, 2026-09-06 (see above)** — paperwork for a transition weeks away; moved to Part 5's launch gate alongside D-5, both due in the hour before the flip, not before. **Depends on:** D-0 | Deferred to Part 5, before public discoverability |

**Done when (original):** production no longer silently presents fabricated shelters as real to
a search engine or a first-time visitor; the demo corpus is hostile enough to exercise every
rendering edge case named in D-4; and the transition to real data is a documented, guarded
procedure rather than a manual judgment call.

**Done when (reduced, 2026-09-06):** the first criterion is met (D-1/D-2/D-3, PR #53) and the
second is being pursued locally (D-4/D-6, no production exposure either way now that the site
is noindexed). The third criterion — a documented, guarded transition procedure — is
deliberately not this phase's to close; it's D-7's, deferred to Part 5, due before the
procedure is actually needed rather than before this phase closes.

### Phase R — Deck memory, two actions, inline reveal

Not a Phase D fix — an unbuilt feature on the product's namesake surface. Two product decisions
from Oleksii (`docs/observations.md`, "Decisions 1 & 2", 2026-09-05), reached after
O-15's diagnosis found the deck's «Написати» button never invoked the reveal path at all (it
called the same handler as a skip) and no swipe was ever persisted. Scoped as its own row set
per Oleksii's explicit instruction; **not started before Phase D finishes.**

**Sequencing, 2026-09-06 reprioritisation:** this is step "2.2" of the post-Phase-D order —
after Phase D's reduced scope (D-9, D-4, D-6) and after O-9's DB connection fix (Part 5,
"Before the MVP gate"), which every DB-backed page including this one pays today. See Phase
D's own reprioritisation note for the full reasoning (`docs/build-plan.md`, Phase D).

| # | Task | Status |
|---|---|---|
| R0 | **Verify first, added 2026-09-06 — before touching R1–R3's code:** (1) whether `feedBrowserClient`'s exclusion of `session.bootstrap`/`animals.reveal` (R3's blocker) was a deliberate scope cut or an oversight — report with evidence (the PR/commit that shipped `feedBrowserClient`, and what it says); (2) what cookies the site actually sets today, checked against `/pro`'s «без кукі» claim — if a cookie is already being set, that claim is currently false and is its own finding, independent of R1–R3; (3) whether the anonymous session identity is stable across a page reload and a full browser restart — R1's device-scoped persistence claim depends on this being true, and it has not been checked | Untouched |
| R1 | Wire `swipes.record` from the deck (drag commit and the skip button), keyed on the existing anonymous session. A skip excludes that animal from the deck's own re-serving, **device-scoped, not session-scoped** — persists across reload and later visits, not just the current tab. **Deck-only**: the gallery's `feed`/`gallery` query is unaffected; a skipped animal stays fully reachable by direct link and in the gallery list. Does **not** feed `scoreAnimal` — ordering inputs stay filters + freshness + completeness, unchanged, so `/prytulkam` §1 stays true. **Built, client-side only — the seen-set exclusion was already fully implemented server-side at M2** (`packages/db/src/repos/feed-repo.ts`'s `buildSeenExclusion`, reading `context.adopterId`, itself already resolved from the session cookie on every request by `apps/web/src/app/api/rpc/[...rpc]/route.ts`). `use-feed-deck.ts`'s `onSwipe` now bootstraps the anonymous session once per page load (memoised, not once per swipe — swiping is high-frequency, unlike the detail page's one-shot reveal) and calls `swipes.record` fire-and-forget after the local UI advance, never blocking it. **Verified two ways, not just unit-tested**: 22 unit tests in `use-feed-deck.test.tsx` (mocked client) plus 12 in `SwipeDeck.test.tsx`, plus 4 real-Postgres integration tests for `feedRepo.hasActiveSeenSet` in `packages/db/test/repos.test.ts`, and a real end-to-end check against the actual running dev server + real local Postgres (a throwaway Node script driving the same `createORPCClient`/`RPCLink` the browser uses) confirming an animal present in `feed.list` becomes excluded after `session.bootstrap` + `swipes.record(pass)` with the same cookie, stays excluded across a second `session.bootstrap` call with that cookie (get-or-return — what a reload/later-visit looks like), and is NOT excluded for a fresh request with no cookie at all (no cross-session leak) — script deleted, DB reseeded to a clean state afterward. **Two reviewer rounds, neither returning PASS outright.** Round 1 returned STOP — three findings are real product/copy decisions, not implementation bugs, and are not mine to resolve; see the STOP note below. Round 1's other findings (a session-bootstrap failure permanently poisoning later swipes; «Далі»/↓ silently persisting a 30-day exclusion for a non-decision, since it shared `handleCommit("left")` with the real skip button; a stale design-doc claim of "for the rest of the deck session" instead of the actual 30-day device-scoped policy) were fixed. Round 2 (PASS WITH NOTES) caught that the «Далі» fix had no test at its actual defect site — the hook-level tests only pinned what the hook does with a direction it's *given*, not that the button hands it the right one; reverting the button's own handler back to the pre-fix bug left every other test in both files green. Fixed: `SwipeDeck.test.tsx` now clicks «Далі» directly and asserts the direction it produces, mutation-confirmed. Round 2 also caught `use-feed-deck.ts` duplicating the `CommitDirection` union as an inline literal instead of importing it — R2's own removal of `"advance"` from the exported type would otherwise typecheck against the stale copy instead of failing the build; fixed. **All three STOP decisions resolved by Oleksii, 2026-09-09 — see below.** Round 3 (PASS WITH NOTES) on the STOP-resolution diff caught a blocking defect in `feedRepo.hasActiveSeenSet`'s first implementation: a raw `db.execute(sql\`...EXISTS...\`)` call whose result shape differs between this repo's two Drizzle adapters (a `RowList` array for postgres-js, `{ rows: T[] }` for neon-http, `packages/db/src/client.ts`'s own comment) — the method would have silently returned `false` in production (Neon) regardless of the real answer, the exact bug the row exists to fix. Fixed by replacing it with a typed `.select().limit(1)` chain, which Drizzle normalises identically across both adapters (the same guarantee every other query in this repo already relies on); 4 new integration tests added directly against real Postgres. Round 3 also caught the field conflating "not computed" (a prefetch call) with "computed, and empty" into one `false` — widened to `z.boolean().nullable()` in the contract, with the handler and hook updated to match | **Resolved.** |
| R2 | Two-action deck: drop «Далі» (`SwipeDeck.tsx`'s third button and its keyboard binding). «Не зараз» skips (R1). «Написати» reveals. **Permanent home for the "«Не зараз» is a filter, not a judgement" sentence** (`docs/standing-constraints.md`, "The swipe is filtering, not judging") — an interim placement lives on the detail page (Phase D) until this row builds the deck with the height designed in for it, rather than squeezed into the existing header | **UI half done, 2026-09-09.** `SwipeDeck.tsx`'s third button (and the now-unused `"advance"` `CommitDirection` variant, `ActionButton`'s `"quiet"` variant) removed. The not-a-judgement notice moved from its interim detail-page home to its permanent one, directly under the deck's action row — `AnimalDetailScreen.tsx` no longer renders it (the rule is about what a *swipe* means, and that page's own «Не зараз» was never a swipe — see `docs/design/README.md`'s updated deviation notes). Real geometry work, measured not assumed: adding the notice's line broke the shelter-line margin at `NARROW_PHONE` (320, a real clip, -22px against an 8px floor) and the canonical `PHONE` frame's exact 396px photo-area assertion — recovered ~12px via two legitimate spacing reclaims (the action row's own card-to-button margin, and the notice's own margin above it), then hid the notice below 360px width (`min-[360px]:block`) rather than let the shelter line clip at the one width narrower than this product's stated audience (`docs/stack-decision.md`'s "budget Android," `ANDROID_PHONE`/360, passes clean). `discovery-layout.harness.ts`'s exact-396 assertion updated to 386 with the same justification this file's own prior V2 repoints used — a real, deliberate content change, not an accidental shift. New harness coverage: notice visible + correctly placed at every viewport at or above 360, hidden (with the shelter line provably intact) at 320. **«Написати» still just records `swipes.record(interested)`, unchanged from R1 — it does not yet open a real reveal.** That's R3's own job, not done here; the two rows were always meant to complete the deck together, not this one alone | **Depends on:** R1, R3 |
| R3 | Inline reveal: wire `session.bootstrap` + `animals.reveal` into the deck's own browser client (today `feedBrowserClient` exposes only `feed.list` — see V1, `docs/observations.md`) and open the contact in a sheet over the deck, per `docs/design/README.md`'s frame 05 (Contact reveal). The deck session must survive a reveal — no exit back to the gallery | Untouched. **Depends on:** none |
| R4 | **Reduced scope, 2026-09-09 (Oleksii's decision on R1's STOP) — restores two sentences rather than fixing two false ones.** Both `/prytulkam` §3's «Обидва способи показують усіх» and `/pro`'s «без кукі» were already deleted outright on R1's own branch (per the new standing constraint, "Removing a false claim is not the same gate as adding one" — a deletion needs no Phase 0 gate; the fuller replacement still does). Neither claim is false anymore; both pages are simply narrower than before. R4 is now: write the fuller, accurate Ukrainian for both — §3's English sense already drafted in `docs/observations.md`'s commitments-register note ("the list shows everyone; the deck does not re-serve what you skipped; nothing is hidden from you that you did not hide yourself"), `/pro`'s sense per Oleksii's own framing ("one session cookie, set only when you act, and what it is for"). Neither is pinned by `copy-status.test.ts` — both false sentences were *deleted*, not replaced with a `[COPY_PENDING]` placeholder, so there's no marker for that test to catch; this row is the only thing tracking that the fuller sentences still need writing. Smaller and less urgent than before — no live page is currently wrong | Untouched |
| R5 | **Filed, 2026-09-09 (Oleksii's decision on R1's STOP item 3) — the proper fix for the deck counter, deliberately not built at R1.** R1 suppresses «N з M» and the progress bar once the seen-set is non-empty (a nullable boolean, `hasActiveSeenSet` on `feed.list`'s output — `null` on a prefetch call, where it isn't computed at all), which tells the caller the gallery's unfiltered total may now overstate what the deck can reach, but not by how much — a first-time visitor still sees the count, a returning one sees none at all, never a wrong one. This row is the fuller fix: a real matching-count field on `feed.list` (or a dedicated count procedure) that reports how many animals the *current caller*, with their own seen-set excluded, can actually still reach under the active filters — restoring an accurate «N з M» for a returning visitor instead of suppressing it outright. Needs its own query-cost look (a second `COUNT` alongside the existing keyset page fetch, or a maintained running count) before committing to a shape | Untouched. **Depends on:** R1 |

**STOP raised on R1's own review, 2026-09-09 — three decisions for Oleksii, resolved same day.**
Committed and pushed per the working loop's amendment (a STOP blocks the merge, not the commit)
while awaiting the decisions below; all three came back and are now implemented on this branch.

1. **`/prytulkam` §3's «Обидва способи показують усіх» was literally false** the moment a real
   adopter skips an animal and returns later. **Resolved: delete the sentence, not hold the PR.**
   A deletion needs no new Ukrainian and no `[COPY PENDING]` — §3 is true again immediately, with
   the commitment temporarily narrowed rather than dropped (`docs/standing-constraints.md`'s new
   "Removing a claim never requires the approval that adding one does," and the commitments
   register's row 8). R4 restores the fuller, accurate version once its Ukrainian is written —
   smaller and less urgent now, since no live page is currently wrong.
2. **`/pro`'s «без кукі» sentence (`uk.about.analytics`) read more true than it was.** The
   trigger widened from "tapped «Написати притулку» on the detail page" to "swiped once, in
   either direction, on the deck" — swiping is the deck's primary interaction, so in practice any
   deck user gets a session cookie immediately, disprovable in DevTools in five seconds on the
   page whose job is being trustworthy. **Resolved: delete «без кукі», keep «без реклами».** Two
   words removed makes the sentence true today; R4 adds the honest fuller sentence — one session
   cookie, set only when you act, and what it's for.
3. **The deck's «N з M» counter and progress bar could show a number the deck can't honour**,
   since both are computed from the gallery's own unfiltered total (`DeckScreen.tsx`), which has
   no seen-set exclusion. **Resolved: suppress on the seen-set, not the session** — condition is
   `!hasActiveSeenSet`, true only once the seen-set is non-empty, not merely because a session
   exists. A first-time visitor keeps the accurate count the design doc specifies; the number
   never appears once it could overstate what the deck can actually reach. Implemented as a new
   `hasActiveSeenSet: boolean | null` on `feed.list`'s output (`null` on a prefetch call, where
   it's not computed at all — only a fresh fetch pays for the real check) rather than a
   matching-count field — the real fix (`feed.list` reporting how many
   cards actually remain reachable, not just whether any are excluded) is deliberately deferred to
   its own future row, not built here, and the contract is not widened beyond this one boolean for
   it.

**STOP-list items 4-8 from the same review round were fixed on this branch, not escalated** —
each was a real implementation bug or missing test, not a product/copy decision: a
session-bootstrap failure permanently poisoning later swipes (the memoised-promise cache didn't
distinguish success from failure); «Далі»/↓ silently persisting a 30-day exclusion for a
non-decision, because it shared `handleCommit("left")` with the real skip button (fixed with a
narrow, temporary third `"advance"` commit type — R2 removes this button and the distinction
entirely); a stale `docs/design/README.md` claim of "for the rest of the deck session" instead of
the actual 30-day device-scoped policy; and the missing regression tests for both bugs, now added.

**Done when:** a skip in the deck survives a reload and a later visit from the same browser
without appearing in the gallery's exclusion; the gallery's own count and listing are provably
unaffected by any skip; «Написати» opens contact info in a sheet without leaving the deck; and
`/prytulkam` §3's Ukrainian is no longer `[COPY PENDING]`.

### Phase P — Detail photos ("2.3")

O-10 (detail page has no real photo gallery — only the primary photo is viewable at size, the
rest are small thumbnails on a design that wastes large-screen space) built together with
critique-item C6 (`docs/design-critique.md` — the detail carousel's crop against real source
aspect ratios; **not** build-plan's own C6, Phase C's "component test infrastructure," a
naming collision between the two documents worth noting so a future reader doesn't conflate
them). One component, one session — `docs/observations.md`'s O-10 entry explicitly says not to
split them. **Depends on:** D-6 (needs the real, deliberately awkward-ratio photographs to crop
against — a mock or invented image would leave C6 exactly as unverified as it already is).

Scoped in full — task breakdown, hours, done-when — when this phase is actually picked up, per
`/phase`'s own Phase 1 planning step, not invented here ahead of the work it plans.

### Phase S — City slugs ("2.4")

O-6 (city filter URLs expose raw UUIDs — unreadable when shared, meaningless to a recipient,
bad for search) and O-12 (the detail page's «← Усі тварини у Бровари» returns to the
*unfiltered* gallery, not to Brovary — the link's text makes a claim the navigation doesn't
honour) scheduled as one row per `docs/observations.md`'s own note on both entries ("same
missing thing... never two [rows]"). Cities gain a stable public slug, URLs become
`?misto=brovary`, and the detail page's back-link returns to the filtered list it names.
Redirect the UUID form for links already shared, so nothing already in circulation breaks.

Scoped in full when picked up, as above.

### Phase K — Polish batch ("2.5")

O-1 (header is a text wordmark, no logo — check the Claude Design export for what was actually
specified before assuming a logo belongs there; if the wordmark was a deliberate choice, this
is a decision change, not a defect), O-4 (filter-label-to-pill spacing too tight — open the
mock before changing anything), O-5 (card grid gains columns above a breakpoint on wide
screens — **recreates F-1's exact preconditions**: recompute the `sizes` attribute from
measured box widths at each breakpoint and assert the variant actually fetched, don't port the
existing clauses forward), O-8 (detail-page breadcrumb moves out of the header, below it,
left-aligned — same "never two navigations at once" direction as `docs/design/README.md:589`),
O-11 (a footer — secondary links and a home for credits), O-13 (e-Ukraine font attribution
moves into that footer, or `/pro` — the attribution itself is non-negotiable under CC BY 4.0,
only its placement is open), O-14 (informative pages' text column stays at its deliberate
~65-character measure; what changes is the composition around it, not the line length —
**superseding that entry's own "schedule after the MVP gate" note**: Oleksii's 2026-09-06
reprioritisation places it in this batch, before the gate, superseding the earlier schedule).

As one batch, not one row at a time, per Oleksii's explicit instruction. Scoped in full when
picked up, as above.

**2026-09-10 — five of seven done, one checked-and-closed with no code change, one parked.**

- **O-1, done.** The header now draws the real «Поріг · Межа» mark (`SiteHeader.tsx`'s new
  `LogoMark`) from `docs/design/README.md`'s own SVG path geometry — arch, threshold, dot, ink
  `#101112` only, 30px desktop / 26px mobile, gap to the wordmark = the dot's own height. Not an
  invented asset: the design doc names the exact path data, so drawing it is following the spec
  the file's own prior comment recorded as unmet. Not built: the 16/24px dot-dropped variant and
  the favicon (a separate asset pipeline, `app/icon.*`, not a header-lockup concern).
- **O-8, done.** The detail page's back-link moved out of `SiteHeader`'s `leading` slot (removed
  entirely — nothing else used it) into its own left-aligned element between the header and the
  content, horizontally aligned with the content column below it. `SiteHeader`'s own `order-last`
  logic (specific to the `leading` slot) went with it; `flex-wrap` itself stays — see the second
  regression below, which is exactly a reviewer round catching a first draft of this bullet
  claiming it was gone too.
- **O-11 + O-13, done together, one component.** A new shared `Footer` (`apps/web/src/features/
  chrome/Footer.tsx`) replaces the one-off `<footer>` fragment that used to live only on the
  gallery page — now rendered on every route that carries `SiteHeader` (gallery, `/pro`,
  `/prytulkam`, detail; never the deck, same reasoning as the header itself). Carries
  `uk.footer.fontCredit` verbatim (unchanged, per that key's own doc comment) plus both existing
  nav links (`uk.nav.forShelters`/`uk.nav.about`) — new placement, not new copy. Suppresses the
  matching link on the page it would point at (`currentPage` prop), the same self-link avoidance
  `SiteHeader.wordmarkIsCurrentPage` already does.
- **O-4, checked, not a defect — no code change.** `Opika Registry System.dc.html`'s own
  computed style for a label+chip-row group is `gap: 12px`, exactly what `FilterRail.tsx`/
  `FilterSheet.tsx` already render. The implementation has not drifted from the design system;
  the design system's own number is what reads as tight. Widening it would be a real deviation
  from a mock-specified value, not a bug fix — not done without sign-off. Full reasoning:
  `docs/observations.md`'s O-4 entry.
- **O-5, done.** A new breakpoint (`--breakpoint-ultrawide: 2000px`) and a 6th-of-24 column count
  above it, capped at a new `max-w-[1992px]` — `docs/design/README.md`'s grid table amended with
  the new row (not a replacement of the existing 1024-1439/1440+ rows), per the decision's own
  instruction. Column width (312px) deliberately matches the existing wide bracket's own, so the
  card does not visually resize at the new boundary. New viewports (`GALLERY_ULTRAWIDE`/
  `_ROOMY`) and new harness cases in `gallery-layout.harness.ts` and `gallery-photo-sizes.
  harness.ts` — not a port of the old 4-column assertions, per the decision's own explicit
  warning about F-1's preconditions. **A real, previously-latent bug found in the process, not
  hidden:** the first attempt at a new photo-sizes case (at a boundary-clear-but-fluid 2200px
  viewport) measured a real photo box of 250.66px against a declared 288px — the grid had not
  yet reached its new ceiling at that width. Root cause and full scope (the same gap already
  existed, untested, in the desktop and wide brackets) filed as `docs/observations.md`'s new
  O-18, not fixed in this row — the new case was moved to the cap-reached 2560px viewport
  instead, matching the existing (if similarly incomplete) pattern the wide bracket's own case
  already set at 1920px.
- **O-14, parked — the *what*, not the *whether*.** The footer half (above) is done, which is
  already a small step toward "not alone on an empty field." The rest needs an actual
  composition decision with no mock to open (`docs/design/README.md` has no section for `/pro`
  or `/prytulkam` at all) — `docs/standing-constraints.md`'s "ambiguous design with no mock" is
  on the working loop's own stop-and-ask list regardless of what a reviewer would say, so this
  wasn't decided unilaterally. Two concrete directions recorded in `docs/observations.md`'s O-14
  entry, with a recommendation, for Oleksii to choose from rather than a default silently
  shipped.

**A second real regression caught by the harness, not assumed safe:** removing `SiteHeader`'s
`flex-wrap` (reasoned, at the time, to be dead weight once O-8 removed its only real user, the
`leading` slot) broke real horizontal-overflow assertions at 360px on both the gallery and
detail pages — the mark's own ~38px (26px + 12px gap) was enough on its own to push the
wordmark+nav row past 360px, independent of `leading` ever existing. Restored, with the doc
comment corrected to explain why it's still load-bearing.

**A third, this one self-inflicted during the branch move:** this row was implemented on top of
`feat/city-slugs` (Phase S, PR #56, not yet merged) and then moved to its own branch off `main`
per "one PR per queue item" — the `AnimalDetailScreen.tsx` merge conflict that move produced was
resolved by hand, and the first resolution left two `<SiteHeader />` calls where one belonged,
caught immediately by the same horizontal-overflow assertion (two wordmarks, two nav pairs, the
`getByTestId` locator strict-mode-violating rather than silently picking one). Fixed before this
row's own `pnpm check` was ever called green.

**Reviewer round: PASS WITH NOTES.** Verified every claim above independently (read the actual
design-doc sections and mock file rather than trusting the summary, ran the actual test suites,
mutation-tested the flex-wrap and duplicate-header fixes) and found four real issues, all fixed:
the polish-batch commit itself hadn't actually been made yet when first reviewed (the duplicate-
header fix was sitting uncommitted — fixed by committing before any PR, this paragraph included);
the new footer's two links rendered at 18px tall against the 48px touch-target floor
(`docs/design/README.md:200`), the exact defect class this same batch's own O-1/O-8 work already
found twice elsewhere — fixed (`min-h-12` added), and pinned with a new, mutation-confirmed
harness assertion (`site-header.harness.ts`, run at exactly 18px before the fix to prove it
catches the real number, not just some regression); this file's own O-8 bullet and
`SiteHeader.tsx`'s top comment both claimed `flex-wrap` was removed, when the very next paragraph
(this one's predecessor) already said it was restored — both corrected; and a test claiming to
guard the logo mark's `aria-hidden` attribute never actually asserted it, passing unchanged when
`aria-hidden` was deleted entirely — rewritten to assert the attribute directly, plus a comment
correction admitting the mark-to-wordmark gap is a rounded practical value, not a literal
render of the design doc's stated "dot's height" (which scales to under 4px at this lockup size).

`pnpm check` green, on this row's own branch (`feat/polish-batch`, off `main`, independent of the
still-open Phase S PR): 833 workspace unit tests (291 domain + 20 i18n + 29 contracts + 10 ui +
135 db + 348 apps/web), `build:web`, and 184 Playwright harness tests, all against local Postgres.

**Rebased onto `main` after R2 (PR #54) merged, 2026-09-10.** R2 touched the same file this row's
own O-8 work does (`AnimalDetailScreen.tsx`) for an unrelated reason — removing the not-a-
judgement notice block R2 relocated to the deck — which put this branch in real conflict with
`main`, not merely stale. Rebased rather than merged, per the standing preference for a clean
history; `docs/decisions-pending-review.md`'s add/add conflict (both branches had their own copy)
was reconciled by hand into one file, exactly as that file's own header note said it would need
to be once either sibling branch landed first. The `AnimalDetailScreen.tsx` conflict itself
auto-merged correctly with no manual intervention — confirmed by reading the result, not assumed.
Full `pnpm check` re-run after the rebase, numbers above reflect that run, not the pre-rebase one.

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

**E5's real cost was ~18 h against its own 3 h line — a +15 h overage, and like Phase V's
12 h, this does not fit the "absorbed, week count unmoved" reasoning either.** Phase 0
investigation found the 3 h estimate priced "chrome" against a deck that was already
reachable; the real state was that `/discovery` still ran on `generateMockCards` entirely,
no browser-side oRPC client existed anywhere in the repo, and no gallery-side entry control
existed at all — wiring real data, a real route, and a real entry point was the actual
scope once that was checked, not assumed. Stopped and reported before starting, and the
resulting scope questions went back to the user rather than being decided in-session. Brings
the critical path to 165 h ÷ 8 h/week ≈ 20.6 weeks, and the grand total including G to
168 h. Whether this — on top of Phase V's already-unresolved 12 h — actually moves the
project's week estimate past "~16 weeks," and by how much, remains the same open re-plan
question Phase V's own paragraph raised; this entry doesn't re-settle it, only adds its
number to the pile waiting on that question.

**Correction: that stop was not the 150%-hours gate condition firing, even though the
number it should have fired on was already visible.** `.claude/commands/phase.md`'s gate
checks an estimate against 150% of the plan's hours; E5's investigation crossed that line
immediately — 3 h planned, and Phase 0 alone had already found enough missing (no browser
client, no real route, mock data throughout) to put the real number several times past
4.5 h. The stop that happened was driven by two separate architecture questions (could the
gallery's header survive a `layout.tsx` split; should the deck get real data at all) framed
and asked on their own terms, not by naming the hours condition explicitly. The outcome was
the same — work paused and went back to the user before implementation — but a gate that
gets satisfied by coincidence rather than by being invoked isn't a gate a future overrun can
rely on; the next one might cross 150% without also raising an architecture question
someone happens to stop and ask about. Worth watching in Phase F: when Phase 0 turns up
scope beyond the plan's number, say so in those terms — "this trips the 150% condition" —
before moving on to whatever question prompted the check.

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

---

## Part 5 — Launch gate

Standing conditions, not phase-scoped work — checked at the specific moment each names, not
bundled into one "before launch" deadline. Two different triggers live in this list:
onboarding the first real shelter is the nearer one, and can arrive days after a deploy, not
weeks.

### Before the first real shelter or animal record is inserted

This is the sharp one. It is not "before launch" — shelter onboarding can happen the moment
someone says yes to an outreach email, independent of whatever else is or isn't ready.

**Location fuzzing.** `packages/db/src/seed.ts` computes every seeded `publicLocation` with
`testOnlyLocationPolicy("seed")` — deterministic, unkeyed, and reversible by anyone reading
the source. Correct for fictional seed data; would defeat the entire point of location
fuzzing the moment a real foster carer's exact address used the same path.

Two guards now shipped, so this can no longer happen silently:

1. `testOnlyLocationPolicy` itself throws if constructed with `NODE_ENV=production`
   (`packages/domain/src/primitives/coordinates.ts`, mutation-tested,
   `coordinates.test.ts`'s "refuses to construct in production"). Not opt-in the way
   `assertProductionLocationPolicy` is — it fires the moment the insecure policy is
   constructed at all, not only if some later step remembers to check the value.
2. `publicLocationOf` (`packages/domain/src/shelters/location.ts`) already took `policy` as
   a required, no-default parameter before this check — verified, not assumed; there is no
   second, laxer path into a `Shelter`'s `publicLocation` (`shelterRepo.insert` takes an
   already-fully-formed `Shelter`, computed nowhere but `publicLocationOf`). No change was
   needed here.

**Still open, and this is the actual remaining gate:** nothing yet calls
`productionLocationPolicy` (`packages/db/src/location-policy.ts`) from a real handler — the
only caller anywhere is `seed.ts`, and it deliberately uses the test-only policy. Before the
first real address is inserted:

- Wire `productionLocationPolicy` into whatever creates a real shelter or animal record.
- Add `LOCATION_HMAC_SECRET` to `apps/web/src/api/env.ts`'s `RequiredProductionEnvSchema` in
  that same change — not before (nothing to validate yet) and not separately (the two must
  land together or the requirement and its consumer can drift apart again, the way the seed
  path already did once).

### Before any route is indexed (and, one hour earlier, before the same flip): D-5 and D-7

Both deferred from Phase D on 2026-09-06 — see that phase's reprioritisation note for the full
reasoning. Neither is urgent while the site is `noindex`ed and no outreach has happened; both
become load-bearing in the same hour `SITE_IS_PUBLICLY_DISCOVERABLE` flips, so both are due
just before it, not before.

- **D-5.** Every demo shelter's contact becomes a clearly-marked placeholder sentinel — no
  invented phone number or handle anywhere in the corpus. The placeholder *format* is still
  undecided (obviously-fake number pattern vs. a real-shaped number with a visible marker vs.
  something else) and needs a decision when this row is actually picked up, not before.
- **D-7.** Write the demo-to-real transition into `docs/standing-constraints.md` and the
  onboarding checklist: wipe before the first `onboard-shelter --commit`; the banner
  (`REGISTRY_HAS_NO_REAL_SHELTERS`) comes down when the wipe happens, separately from noindex
  (`SITE_IS_PUBLICLY_DISCOVERABLE`) below, which stays down through the launch-gate window
  until the site is actually meant to be found — the two do **not** come down together, that
  is the whole point of D-1's two constants; why `robots.txt` allowing crawl is deliberate;
  the coexistence window named as the point of maximum danger.

### Before any route is indexed

**Flip `SITE_IS_PUBLICLY_DISCOVERABLE` (`apps/web/src/seo-flags.ts`) on, or replace it with
per-route logic.** This is a separate fact from `REGISTRY_HAS_NO_REAL_SHELTERS` in the same
file — the two constants exist specifically because this paragraph's window collapses to
nothing if they don't: a real shelter can exist in the database, verified and reachable by
direct link, before the site is meant to be publicly discoverable at all.
`REGISTRY_HAS_NO_REAL_SHELTERS` may already be `false` by this point (the demo corpus
wiped, real shelters onboarded); `SITE_IS_PUBLICLY_DISCOVERABLE` is the later, separate
gate. Indexing while the registry still holds no real shelters would put fictional animals
in front of a real adopter — caught in CI by `seo-flags.test.ts`'s own assertion on the real
constants before either ever reaches a deploy. `assertDemoDiscoverabilityInvariant`
(`instrumentation.ts`) is the second, runtime layer of the same check: defense in depth for
a build that reached a running instance without that test having run, not the mechanism
this gate is actually relying on day to day. Later than the location-fuzzing gate above, not
earlier.

### Before real traffic (not urgent at preview-only volume)

**Move the in-memory rate limiter (`apps/web/src/api/rate-limit.ts`) to a shared store**
(Redis/Upstash/Vercel KV). Already documented in that file's own comment as a known gap:
each serverless instance holds its own counter, so the effective per-IP ceiling is `limit ×
instance count`, not the stated limit — adequate as a first-line defense at near-zero
traffic, not at real usage.

### Before the MVP gate — a real touch-target/keyboard enforcement mechanism (O-19)

**Scheduled here by Oleksii's own instruction (2026-09-10 status call), not filed-and-forgotten:**
"the MVP gate requires 48px targets and keyboard-only on every surface; three hand-copied
constants covering whatever was remembered cannot deliver that, and `Footer.tsx` is the proof."

`docs/observations.md`'s O-19 has the full finding: `MIN_TOUCH_TARGET_PX = 48` is asserted
correctly everywhere it's checked, but as three independent, hand-copied local consts
(`discovery-layout.harness.ts`, `gallery-filters.harness.ts`, `site-header.harness.ts`), each
applied only to the specific elements that file's author remembered to write a case for. A new
interactive element ships with no assertion covering it until someone happens to add one by
name — exactly how `Footer.tsx` shipped its two links at 18px, caught by `opika-reviewer`, not by
the test suite that already existed to catch it.

**What this row needs to build, when picked up:** a single shared Playwright helper (something
like `assertMinTouchTarget(page, selector)`) that new harness files reach for by construction,
replacing the three duplicated consts, *plus* — the part that actually closes the gap, not just
tidies it — one harness case per user-facing surface that sweeps every real interactive element
on that surface (every `getByRole("link")`/`getByRole("button")` result, not a hand-picked
subset), so a new button or link is covered the moment it exists. The same shape of gap likely
exists for keyboard reachability (a focus-visible check exists per-component today, same as the
touch-target one) — the MVP gate's "keyboard-only on every surface" requirement is the same
argument applied to a second property, and should be scoped into this row rather than left as a
second, later rediscovery of the identical mechanism gap.

Exact sweep strategy (walk the accessibility tree vs. enumerate roles vs. something else) not
decided — `docs/observations.md`'s O-19 says so explicitly ("filed, not designed. Do not build
it now") and that instruction stands; this entry only fixes *when*, not *how*.

**2026-09-12 — the shared helper half done, the sweep half deliberately not attempted.**
`expectMinTouchTarget(locator, label)` (`apps/web/test/harness/harness.ts`, beside `rectOf`,
which it wraps) replaces all three hand-copied `const MIN_TOUCH_TARGET_PX = 48` +
`expect(rect.height, ...).toBeGreaterThanOrEqual(...)` pairs in
`discovery-layout.harness.ts`/`gallery-filters.harness.ts`/`site-header.harness.ts` — one call
site, one message format, one place a future edit to the 48px figure itself has to land. Every
existing case (back-to-list button, retry button, deck-entry link, both nav links, both footer
links) now calls it; nothing about which elements get checked changed, only that they now share
one mechanism instead of three independent hand-copies of the same three lines.

**The sweep — "every interactive element gets this check by construction, not by someone
remembering to write a case for it by name" — is the part that actually closes O-19's own gap,
and it is deliberately not attempted here.** The exact strategy is a real, undecided design
question (walk the accessibility tree? enumerate `getByRole("link")`/`getByRole("button")`
across a page and exclude known-decorative ones? something else?), not a mechanical refactor —
inventing an answer unilaterally, under this row's own "do not build it now" standing next to a
still-open design question, is exactly the kind of scope creep this project's standing
constraints warn against. What's shipped removes the three-copies problem the helper alone can
fix; what's still open is recorded as open, not quietly narrowed into "helper exists, therefore
O-19 is done." The same applies to O-19's second half (keyboard reachability swept the same
way) — untouched, same reasoning.

### Before the MVP gate — DB connection strategy (O-9) — "2.1" in the 2026-09-06 reprioritisation

Unlike the rate limiter above, **this one is already live at today's near-zero traffic** —
`docs/observations.md`'s O-9 measured every DB-backed production page plateauing at a
~1s floor that repeated warm requests don't reduce, while the identical code against a local
Postgres runs in ~130ms. No Vercel function region is pinned anywhere in the repo
(`apps/web/vercel.json` sets only `framework`); production's own `X-Vercel-Id` shows the function
executing in `iad1` (US East) against Neon's `aws-eu-central-1` (Frankfurt).
`packages/db/src/client.ts` uses the plain TCP driver (`postgres`/postgres-js) over that gap
rather than the pooled/HTTP path `docs/stack-decision.md:145` names as Neon Launch's own answer
to serverless connection cost.

**Own row, scheduled after Phase D and before this gate — not a mid-D patch:** fix
`packages/db/src/client.ts`'s connection strategy (pooled connection string and/or Neon's HTTP
driver), informed by Oleksii's own Network-tab timing of the actual reveal click (still pending
as of O-9's diagnosis) to confirm how much of the reveal flow's latency this actually closes.

**2026-09-09 — diagnosis reconfirmed today, driver fix built and reviewed.** Before touching any
code, the ~1s floor was re-measured against the live site (not trusted from four-day-old notes):
`/tvaryny` 1.05–1.10s warm (3.65s cold), `/tvaryny/[id]` 0.85–0.95s warm, `/prytulkam` (non-DB)
0.10–0.28s warm — same shape as the original diagnosis, still true. `X-Vercel-Id` still reads
`iad1`. The prior session's decisive test (query count doesn't explain it — a 1-query endpoint
was *slower* than a 2-query one) was not re-run against production (constructing the raw oRPC
call by hand risked a malformed request against production for a result already established four
days earlier with clear methodology); the page-level reconfirmation above stands in for it.

**Fix:** `createDatabase` (`packages/db/src/client.ts`) now branches on the connection string's
own hostname — a real Neon host (`*.neon.tech`, matched case-insensitively) gets
`@neondatabase/serverless` + `drizzle-orm/neon-http` (one HTTP fetch per query, no TCP+TLS
handshake to repeat); everything else, including every local dev and test run against
docker-compose Postgres, keeps the existing `postgres`/postgres-js TCP driver, which the HTTP
driver has no way to reach at all. `createDatabaseWithClient` (`onboard-shelter.ts`'s own direct
Neon connection, and every test's local client) is untouched — it never goes through the new
branch. `@neondatabase/serverless@1.1.0` added to the catalog, justified on its own terms (MIT,
zero transitive dependencies, the only way to reach Neon over HTTP), not as something
`docs/stack-decision.md`'s ADR specifically pre-approved — that line is a vendor-feature bullet,
not a decision record for this row.

**Does not close this gate on its own — only the connection-overhead half of the diagnosis is
addressed.** The `iad1`-vs-`aws-eu-central-1` region mismatch is untouched; every request still
crosses the Atlantic, this row only removes the handshake paid on top of that crossing.

**Two review rounds, both real findings:**
- Round 1: a real union return type (`PostgresJsDatabase | NeonHttpDatabase`) broke
  `swipeRepo.record`'s `.onConflictDoUpdate(...).returning(...)` call (a TypeScript
  overload-resolution artifact confirmed by the same call typechecking cleanly against each
  adapter in isolation, not a real behavioural gap) — resolved by annotating `Database` as
  `PostgresJsDatabase` and casting the Neon branch to it, justified narrowly: nothing in
  `packages/db/src/repos` calls `.execute()` (the one place the two adapters' raw result shapes
  genuinely differ) or `.transaction()` (which `neon-http` doesn't support at all and would only
  fail against real Neon in production, never locally — the comment says so explicitly rather
  than claiming the two adapter classes are interchangeable).
- Round 2: `isNeonHost` was case-sensitive (`postgres:` isn't a WHATWG special scheme, so `URL`
  never lowercases the host — an uppercased hostname in a real `DATABASE_URL` would have silently
  kept the slow driver, nothing red anywhere) and a malformed connection string's parse error
  leaked the whole string, password included, via `input`. Both fixed and mutation-tested — the
  case-sensitivity fix reverted via `sed` (not the linted `Edit` path) and confirmed the new test
  goes red without it. `apps/web/src/api/db.ts`'s memoisation comment, which said "reuses a single
  pool" — no longer true on the Neon branch, which holds no pool at all — corrected. 9 new unit
  tests (`packages/db/test/client.test.ts`) pin `isNeonHost`'s full matrix (real-shaped Neon
  hosts, local hosts, an uppercased Neon host, `neon.tech` appearing outside the hostname, a
  malformed URL not leaking its password) plus one offline-checkable structural test that
  `createDatabase` actually returns a different driver class per branch (via Drizzle's own
  `entityKind` symbol, not `constructor.name`) — mutation-confirmed by inverting the branch and
  watching it fail.

**Real Vercel preview timing, obtained via `vercel curl` (the CLI's authenticated path through
Deployment Protection — plain `curl` gets a 302 to a login page) against this branch's own PR #53
preview, same region as production (`X-Vercel-Id` confirmed `iad1` on both):**

| Page | Before (production, unchanged code, contemporaneous samples) | After (this preview, warmed) |
|---|---|---|
| `/tvaryny` (gallery) | median ~1.10s (9 samples, range 1.02–1.23s) | median ~0.90s (14 samples, range 0.78–1.12s) |
| `/tvaryny/[id]` (detail) | median ~0.88s (8 samples, range 0.84–0.96s) | median ~0.70s (8 samples, range 0.65–0.92s, clear downward trend as it warmed) |

**Honest reading: real improvement, ~18–20%, not the dramatic fix "the one-second floor" might
suggest, and this row does not close the gate on its own.** The gallery page's samples overlap
production's range more than the detail page's do — plausibly because its query is heavier (a
scan, per the earlier decisive test), so query execution time is a larger share of its total and
the connection-overhead saving is a smaller fraction of the whole. The detail page's samples show
a real downward trend across 8 warm hits (0.92s → 0.65s), consistent with `neon-http`'s
per-request HTTPS connections benefiting from keep-alive reuse once the underlying runtime has
one open, the same way the old TCP driver's connections could in principle reuse a warm instance
but empirically weren't (the original diagnosis's own working hypothesis).

**What this result implies about the diagnosis, stated plainly:** switching from TCP to HTTPS
does not eliminate a handshake — HTTPS pays its own TCP+TLS handshake. What it removes is the
*Postgres-protocol* handshake layered on top (SSL negotiation, startup packet, auth exchange) —
worth perhaps one fewer round trip, which is consistent with an 18–20% cut rather than the
order-of-magnitude one might hope for. The dominant remaining cost is almost certainly the
transatlantic round trip itself (`iad1` ↔ `aws-eu-central-1`), which no driver choice removes —
only the region-pin named as this row's unaddressed other half would.

**2026-09-09, continued — region pin actioned.** `apps/web/vercel.json` now sets
`"regions": ["fra1"]` (Frankfurt, Vercel's region code nearest Neon's `aws-eu-central-1`) —
confirmed against Vercel's own current docs that `regions` is the correct, non-deprecated
top-level key (not `functionFailoverRegions`, which is a separate, Enterprise-only failover
mechanism) and that pinning a single region is available at the Pro tier this project is already
on. Confirmed static routes (`/pro`, `/prytulkam`, `/robots.txt`) are unaffected — `pnpm build:web`
produces a byte-identical route table with and without the config, and Vercel's own CDN serves
static content from the region closest to the *visitor* regardless of the function region setting.
**Accepted, not fixed:** dropping `iad1` from `regions` entirely (rather than listing
`["iad1", "fra1"]`) removes US-region execution as a fallback — real failover
(`functionFailoverRegions`) is Enterprise-only, and listing two regions in `regions` itself would
route by proximity to the *visitor*, not act as failover, which would put US traffic back through
`iad1` and undo this fix for exactly the visitors it's least needed for (a Ukrainian-oblast
product). Single-region is the correct call at this plan tier, named as a real tradeoff rather
than silently accepted.

**Stray artefacts from this session's own investigation, cleaned up, not shipped:** the `.gitignore`
addition from linking this project locally (`vercel link`, needed to run `vercel curl` against
protected preview deployments — see the timing table above) originally added a bare `.env*` line,
which silently overrode the pre-existing `!.env.example` negation three lines above it (gitignore
resolves by last-matching-pattern) — a real, if latent, bug: `apps/web/.env.example` or any future
`*.env.example` would have been silently git-ignored, never shipped, with nothing red anywhere.
Fixed by removing the redundant line entirely — `.env`/`.env.local` were already covered by the
file's existing patterns, confirmed via `git check-ignore` both before and after. Several other
stray local files (curl/fetch output redirected to short filenames during this investigation) were
found untracked and deleted before committing, not left for a future `git add -A` to catch.

**Real timing with both fixes together, measured on the region-pinned preview (`X-Vercel-Id`
confirmed `fra1` on this deployment):**

| Page | Before (unfixed production) | After driver fix alone (previous preview, `iad1`) | After driver + region pin (this preview, `fra1`) |
|---|---|---|---|
| `/tvaryny` (gallery) | median ~1.10s | median ~0.90s | median ~0.42s (6 samples, range 0.27–0.55s) |
| `/tvaryny/[id]` (detail) | median ~0.88s | median ~0.70s | median ~0.24s (6 samples, range 0.21–0.33s) |
| `/prytulkam` (non-DB, unchanged) | ~0.10–0.28s | — | ~0.11–0.27s |

**This is the real result, and it's the dramatic one the diagnosis pointed at all along — the
region mismatch, not the driver, was the dominant cost.** ~62% off `/tvaryny`, ~72% off
`/tvaryny/[id]`, both landing within roughly 2–3× of the non-DB baseline instead of 8–10×. The
"one-second floor" this row set out to explain is gone on both measured pages. The driver fix's
own, separately-measured ~18–20% (previous table) is still real and still worth having on its own
terms (it's what made the region pin's improvement this clean — without it, some of this gain
would have been masked by the Postgres-protocol handshake still riding on every request), but the
region pin is unambiguously where most of the win came from.

**This row is now done — both the connection-overhead half and the region-mismatch half of O-9's
diagnosis are addressed and verified.** Remaining, explicitly out of this row's scope: a genuinely
cold start against the fixed code (not measured — every sample above is warm), and the reveal
flow's own two-round-trip structural cost (`session.bootstrap` then `animals.reveal`), which
neither fix touches.

**Still cannot be verified from this position:** a genuinely cold start for the fixed code (every
sample above came from an already-warmed preview instance — the original diagnosis's 3.65–4.33s
cold figures have no post-fix counterpart here), and the reveal flow's own two-round-trip cost
(`session.bootstrap` then `animals.reveal`, O-9's other named structural multiplier), which this
row doesn't touch at all. `pnpm check` is green (807 tests total in the final commit, `build:web`,
and the full harness, all against local Postgres via the unchanged postgres-js path).

**Amendment, 2026-09-09 (Phase R, new standing constraint) — what "verified" actually covers
here.** `pnpm check`'s local suite exercises the `postgres-js` branch only; it cannot and does
not verify `createDatabase`'s `neon-http` branch, which is what production actually runs. What
*was* verified against real Neon: `isNeonHost`/`createDatabase`'s branch-selection logic (the
timing runs above, against two real Vercel preview deployments, only succeed at all because the
correct driver class is selected), and the driver class identity itself
(`client.test.ts`'s own "offline-checkable half," honest about its own limit: "nothing here can
reach" a real Neon instance). What was *not* independently re-verified per query: whether every
individual repo method's result shape is actually adapter-agnostic, which `client.ts`'s own
comment claims but which only holds so long as nothing in the repo layer calls raw `.execute()`
— R1 found and fixed exactly one violation (`feedRepo.hasActiveSeenSet`, which silently returned
`false` in production regardless of the real answer; see the standing constraint this amendment
references). As of that fix, `grep -rn "\.execute(" packages/db/src/` returns nothing in the
repo layer (only comments, `seed.ts`, and `test-utils/setup.ts` — neither of the latter two runs
against Neon in production). O-9's own connection-selection change is not the source of open
risk; the general class of risk it makes possible is what the standing constraint now names.
