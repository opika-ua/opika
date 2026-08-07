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
| **M3** — seed data | 300+ animals, realistic distributions | Done. 320 animals, 8 shelters, shaped freshness and vaccination distributions, fostered animals, real photos. `db:seed` itself has not been re-run in a verification pass since — still merely asserted, not a live gap this rewrite closes |
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

**Test counts now:** 376 vitest, 17 harness.

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
can tell truth from shape.** Four of seven tasks are already done; what's below is
accurate as of this rewrite, not as of when the course correction was written.

| # | Task | h | Status |
|---|---|---|---|
| C1 | Merge everything — one `main`, one truth | 3 | **Done.** M4 follow-up, M5, the bundler fix, PRs #15–#17 are all on `main` |
| C2 | Verification gate — harness in CI, `next build` gated, markup-inspection ruled out as evidence | 6 | **Done** (PR #15), and generalised into `docs/standing-constraints.md` |
| C3 | Tailwind migration — `tokens.ts` → Tailwind `@theme`, deck converted from inline styles | 8 | **Done** (PR #16). Pixel parity verified by screenshot diff, not assumed |
| C4 | Extract `packages/ui` and `packages/i18n` — tokens and primitives out of `features/discovery`; strings out with them; add the English file the design's string table implies | 8 | **Remaining.** `tokens.ts` and `strings.uk.ts` are still feature-scoped; there is still no English string file |
| C5 | Wire the typography — `next/font`, Cyrillic + Latin subsets, measure the payload | 2 | **Done** (PR #16) |
| C6 | Component test infrastructure — RTL + happy-dom, real tests proving the setup | 4 | **Done** (PR #15) |
| C7 | App shell and navigation — a real `page.tsx`, responsive layout, a view-mode switch with a persisted preference | 3 | **Remaining.** `apps/web/src/app/page.tsx` is still `"API-only at this milestone."` — no entry point, no navigation |

**Remaining: C4 + C7, ~11 h.**

**Done when:** the home page is a real entry point with navigation between the gallery
and the deck, design tokens and shared strings live in `packages/ui`/`packages/i18n` (not
`features/discovery`), an English string file exists, and `pnpm check` stays green
throughout — it already does for C1–C3/C5–C6; C4 and C7 must not regress it.

**Decisions this phase must surface:** whether `packages/ui` takes any dependency beyond
what's already justified in the catalog (per `docs/standing-constraints.md`'s "justify
every dependency"); the view-mode preference's storage (the design's own answer,
`docs/design/README.md` "Gallery ↔ Deck": `sessionStorage`, not permanent — a link shared
into Telegram always opens the gallery).

### Phase E — Gallery

**Do this after Phase C, and only once `docs/gallery-contract-decisions.md`'s five
decisions are settled** — building gallery UI ahead of the contracts it needs is exactly
the M5 mistake (grep for card text, ship a dead gesture) in a different shape.

| # | Task | h |
|---|---|---|
| E0 | Contract + schema reconciliation — `gallery.list` (OFFSET), `gallery.relaxationCounts`, `wait_anchor_at` column + index + `waitAnchorOf`, `buildFeedPredicate` factored out of `feedRepo.list`, both new procedures added to `packages/contracts`' `contract` export | 10 |
| E1 | Gallery grid over `gallery.list` — responsive columns (1/2/3/4 per the design's breakpoint table), `AnimalCard`, freshness marker reused from the deck | 10 |
| E2 | Filters as a visible rail (≥1024) / the existing sheet (<1024), extended with sort. Filter and sort state in the URL — shareable, back-button-correct | 6 |
| E3 | Numbered pagination — `?stor=N`, prev/next, active page leaf-filled, all targets 44px. Not infinite scroll (`docs/design/README.md` "Pagination — not infinite scroll" gives the reasoning: indexed URLs, working back button, shareable into Telegram) | 4 |
| E4 | Empty (no-match, with relaxation-count suggestions), loading (skeleton, no shimmer/pulse), error (whole-list and next-page, distinguished per the design) states — both form factors | 4 |

**Total: ~34 h.**

**Done when:** someone browses the full corpus on a 1920px desktop and a 360px phone,
filters and sorts on both, shares a URL that reproduces exactly what they saw, and the
no-match state's suggestions carry real numbers computed by `gallery.relaxationCounts`,
not placeholders.

**Decisions this phase must surface (from `docs/gallery-contract-decisions.md`, restated
so they aren't missed mid-implementation):**
- Whether `reserved` carries `publishedAt` forward (§2) — a `packages/domain` change,
  stops at the plan gate regardless of which way it's decided.
- The "сусідні міста" copy implying city adjacency the schema doesn't have (§4) — a
  design-copy call, not an engineering one.
- Confirm the 2,000-row OFFSET boundary (`docs/standing-constraints.md`) hasn't already
  been reached by the time this phase starts — it won't have been, but the check costs
  one query.

### Phase F — Detail & Reveal

The former M6, responsive from the start rather than retrofitted, and now the SEO path
the acquisition argument depends on (`docs/course-correction.md` §4: no marketing budget,
so shared links and indexed pages are the growth mechanism).

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
| G1 | iOS Safari investigation, restarting from scratch — the prior investigation notes were lost with the rest of the uncommitted M5 work and are deliberately not being reconstructed (`docs/session-state.md`); the failure has never reproduced on any other engine | 4 |
| G2 | Device testing on real hardware — Android and iOS, not simulators | 3 |
| G3 | Promote the deck from `/discovery` to its real route (`/tvaryny/gortaty` per the design's URL scheme, `noindex` — a viewing state, not a page), entered from the gallery with the gallery's current filters and sort inherited | 3 |

**Total: ~10 h.**

**Done when:** 30 uninterrupted swipes on a real mid-range Android and a real iPhone,
entered from and returning to the gallery at the same scroll position and card.

**Decisions this phase must surface:** none anticipated — flag if the iOS investigation
turns up a fix that touches `packages/domain` or the gesture's pure decision function,
per the standing stop-gate.

### Phase H — Remainder to launch

The former M7–M12, unchanged in substance, two additions.

| # | Task | h |
|---|---|---|
| H1 | Image pipeline — R2, presigned upload, `sharp` variants, CDN | 10 |
| H2 | Internal admin — animal/shelter CRUD, CSV import, **desktop layouts** (addition — the original plan assumed a single admin form factor) | 12 |
| H3 | i18n — next-intl wiring, uk + en message files, full-ICU boot assertion | 4 |
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
| C — Consolidate (remaining) | ~1.5 | 11 |
| E — Gallery | 4–5 | 34 |
| F — Detail & reveal | 3 | 22 |
| G — Deck completion | off critical path | 10 |
| H — Remainder to launch | 7 | 56 |
| **Total from this rewrite** | **~16 weeks** | **~133 h** |

At 8 h/week of code and 2 h/week of shelter recruitment, **soft launch lands early
February 2027** — consistent with the course correction's estimate; this rewrite reflects
~11 h of Consolidate work already spent and landed rather than changing the target.

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
