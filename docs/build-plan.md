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
| E2.5 | 2D arrow-key navigation across the gallery grid (`docs/design/README.md`'s "Keyboard" table — ← ↑ → ↓ move focus by column count, edges don't wrap; Home/End jump to first/last card), independent of ARIA role. Runs before E3/E4 so page-boundary and zero-result focus behaviour are inherited already-settled, not invented per-phase. Roving tabindex applied client-side, after hydration, only — the grid ships fully tabbable by default with no JS; both states asserted separately in the harness | 3 |
| E3 | Numbered pagination — `?stor=N`, prev/next, active page leaf-filled, all targets 44px. Not infinite scroll (`docs/design/README.md` "Pagination — not infinite scroll" gives the reasoning: indexed URLs, working back button, shareable into Telegram) | 4 |
| E4 | Empty (no-match, with relaxation-count suggestions), loading (skeleton, no shimmer/pulse), error (whole-list and next-page, distinguished per the design), out-of-range page (200, last valid page, **the note must actually render** — see the phase's own done-when below, not just the copy existing) states — both form factors | 4 |
| E5 | Gallery ↔ deck view-mode switch — moved here from C7 (`docs/build-plan.md`'s Phase C correction): a control with only one working destination isn't buildable before this phase. `sessionStorage`-persisted last mode, entry ("Гортати по одній") and exit ("До списку" / Esc, returning to the same scroll position per `docs/design/README.md` "Gallery ↔ Deck") | 3 |

**Total: ~45 h.**

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
first — issue #28 records the two build-time constraints (roving tabindex is client-only,
never server-rendered; ordering ahead of E3/E4) in full.

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
| F1 | Animal detail page, both form factors — desktop per `docs/design/README.md` "Desktop Breakpoints", "04 Detail — 1440" (sticky left column, fluid right, footer action pair moves up under the freshness block); mobile is the existing 04 | 10 |
| F2 | `generateMetadata` / Open Graph on the detail page, via the same in-process router call `docs/gallery-contract-decisions.md` §5 establishes — never more than the public contract already permits a client to see | 3 |
| F3 | Contact reveal — desktop modal (640-wide, focus-trapped, animal's URL stays in the address bar) over the existing full-screen mobile 05 | 4 |
| F4 | "My reveals" list, both form factors | 3 |
| F5 | Donation link — external, destination domain visible, `rel="noopener"` | 2 |

**Total: ~22 h.**

**Done when:** the detail page is reachable and correctly metadata'd without JavaScript,
the reveal modal traps focus and restores it on close, and "my reveals" renders
identically in substance on a phone and a 1440px desktop.

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

**Total: ~10 h.**

**Done when:** 30 uninterrupted swipes on a real mid-range Android and a real iPhone,
entered from and returning to the gallery at the same scroll position and card.

**Decisions this phase must surface:** none anticipated — flag if the iOS investigation
turns up a fix that touches `packages/domain` or the gesture's pure decision function,
per the standing stop-gate.

### Phase H — Remainder to launch

The former M7–M12, unchanged in substance, one addition here. The original course
correction listed two; its second (the count queries) moved into Phase E's E0, folded
into `gallery.list`'s output per `docs/gallery-contract-decisions.md` §3.

| # | Task | h |
|---|---|---|
| H1 | Image pipeline — R2, presigned upload, `sharp` variants, CDN. Replaces E1.5's `apps/web/src/image-loader.ts` stub — the app's single `next/image` loader — with real R2/CDN URL construction, which is a change to that one file and not to any call site in `AnimalCard`/`SwipeCard`, and retires E1.5's committed placeholder photos | 10 |
| H2 | Internal admin — animal/shelter CRUD, CSV import, **desktop layouts** (addition — the original plan assumed a single admin form factor) | 12 |
| H3 | i18n — next-intl wiring, uk + en message files, full-ICU boot assertion. Also: native-speaker review of `pluralizeUk`'s output (`packages/domain/src/primitives/plural.ts`, added E2) across every noun form it composes — verified mechanically (`Intl.PluralRules('uk')` boundaries, tested at 1/2/5/11/21/22) but not by a native speaker, and animate feminine nouns plus accusative government under case-governing verbs ("Знайдено" vs "Підходить") is not something rule-reasoning alone reliably gets right | 4 |
| H4 | PWA — Serwist, manifest, offline shell, Lighthouse pass | 8 |
| H5 | Observability + legal — Sentry, PostHog, privacy policy (GDPR), consent handling | 10 |
| H6 | Real shelter data + soft launch — onboard 5–10 shelters, verify each through the FSM, spot-check every listing | 12 |

**Total: ~56 h** (50 h original + the admin desktop-layout addition).

**Done when:** matches the original M7–M12 definitions of done, unchanged — one uploaded
photo produces all variants and renders through the CDN; a shelter and its animals can be
added and verified without touching SQL; locale switch preserves route and state; the app
installs on Android with Lighthouse ≥90; a thrown error appears in Sentry within a minute;
5+ verified shelters and 50+ live animals at soft launch.

---

## Part 3 — Timeline

| Phase | Weeks | Hours |
|---|---|---|
| C — Consolidate | — | 0 (done) |
| E — Gallery | 4–5 | 45 |
| F — Detail & reveal | 3 | 22 |
| G — Deck completion | off critical path | 10 |
| H — Remainder to launch | 7 | 56 |
| **Total from this rewrite** | **~16 weeks** | **~133 h** |

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
