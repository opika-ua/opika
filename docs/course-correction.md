# Opika — Course Correction

**Date:** 6 August 2026 · Written after a repo audit at the end of M5
**Status:** supersedes `docs/build-plan.md` from M5 onward

---

## 0. Why this exists

Two things happened at once. A build failure exposed that CI had been green on an
application that did not build, and a new requirement arrived — **the app must work on
desktop as well as mobile, and animals must be browsable as a normal gallery, not only as
a swipe deck.**

Both are worth stopping for. The first is a process failure that will repeat. The second
invalidates a meaningful part of the design and the plan.

This document records what is actually in the repository, what is stale, what the new
requirement costs, and what the plan becomes.

---

## 1. What is actually built

Verified by reading the repository, not by reading the plan.

### Solid, and better than expected

| Area | State |
|---|---|
| `packages/domain` | Complete. Entities, discriminated unions, verification FSM, freshness, scoring, seen-set. ~252 tests |
| `packages/contracts` | Complete. 8 oRPC procedures, view projections built with `pick`. ~24 tests |
| `packages/db` | Complete. Drizzle schema, migrations, repositories, keyset feed query with EXPLAIN assertions, HMAC location digest. ~30 tests |
| `apps/web/src/api` | Complete. 8 handlers, hand-rolled session, signed cursors, split rate limiting |
| Seed data | 320 animals, 8 shelters, shaped freshness, fostered animals, real photos |
| Design | Full handoff in `docs/design/` — "Keeper's Voice", eight screens, tokens, copy |

**The backend and the domain layer are genuinely in good shape.** Nothing below should be
read as undoing that. The problem is entirely above the API line.

### The UI, honestly

| Expected | Actual |
|---|---|
| `packages/ui` — shared primitives | **Does not exist.** All UI is in `apps/web/src/features/discovery/` |
| `packages/i18n` | **Does not exist.** `strings.uk.ts` sits inside the discovery feature; there is **no English file at all** |
| Design tokens as a shared layer | `tokens.ts` is inside `features/discovery` — feature-scoped, though colour, type, spacing and motion are global |
| Tailwind (per the stack decision) | **Not installed.** Everything is inline style objects. `globals.css` states this explicitly |
| Typography (Literata / Commissioner / IBM Plex Mono) | **Not wired.** No `next/font` import; the font manifest is empty. The app renders in system fonts |
| Home page | `page.tsx` is 86 bytes: *"API-only at this milestone."* No entry point, no navigation |
| Any list or gallery view | **Does not exist** |

### Testing, honestly

- **No component test infrastructure.** `apps/web` has no `@testing-library/react`, no
  `jsdom`, no `happy-dom`. Every existing test runs in Node. **A React component in this
  repository cannot currently be tested at all.**
- **No Playwright.** The build plan called for 4–6 end-to-end specs. None exist, and the
  dependency is absent.
- **The Chromium harness that actually found the M5 bugs is uncommitted** and not in CI. It
  is the single most valuable piece of tooling produced this week and it currently exists
  only in a working tree.

### Repository state

`main` is at the M4 merge. Outstanding work sits in three places: the M4 test follow-up
branch, `feat/m5-swipe-deck`, `fix/web-bundler-resolution`, plus nine uncommitted files
carrying the layout and gesture fixes. **Nothing is lost, but nothing after M4 is
consolidated either.**

---

## 2. The pattern behind the failures

Three separate incidents, one cause.

| Incident | What was claimed | What was true |
|---|---|---|
| M0 | "`pnpm check` passes" | `node_modules` did not exist; it had never been run |
| M4 | Definition of done ticked | *"Structurally implemented, but no integration tests"* |
| M5 | "/discovery renders" | Verified by curling HTML and grepping for text, while overlapping buttons and a dead gesture sat in the page |

**Every one of these passed a check that confirmed shape rather than behaviour.** A file
exists. A type compiles. A string appears in markup. None of those are evidence that the
thing works.

The M5 incident is the clearest: `tsc` accepted `.js` extensions, so typecheck was green
while the bundler failed — and nothing ever ran `next build`. CI was structurally green on
an application that could not start.

**This is the thing to fix, and it is more important than any milestone below.** A
definition of done that can be satisfied without running the software is not a definition
of done.

---

## 3. The new requirement, and what it costs

> The app must work properly on PC and mobile, and animals must be viewable as a normal
> responsive gallery, not only as swipe cards.

This is a reasonable requirement and it should have been in the original brief. It was not,
and that is a gap in the plan I wrote — "mobile-first PWA" was taken as "phone-only", and
nobody challenged it.

### What it breaks

**The design handoff is phone-only.** All eight screens are specified at 390×844. There are
no breakpoints, no desktop layouts, and no gallery of any kind. Roughly half of a second
design pass is required.

**Inline styles cannot express media queries.** This is the sharpest technical consequence.
The current approach — every component styling itself with inline objects — has no path to
responsive behaviour except JavaScript breakpoint detection, which is the wrong tool
(it flashes on load, breaks SSR, and re-renders on resize). Responsive layout requires
Tailwind or CSS modules. The stack decision said Tailwind; the implementation quietly went
another way and nobody caught it.

**The app shell assumes a fixed, non-scrolling, phone-sized surface.** `globals.css`
states it: *"The deck is a fixed full-height surface — the page itself never scrolls."*
That assumption is load-bearing for the gesture and incompatible with a desktop gallery.

**Navigation does not exist.** With two browsing modes there must be a way to move between
them and to remember a preference.

### What it costs

| Work | Hours |
|---|---|
| Migrate styling to Tailwind, tokens → Tailwind config | 8 |
| Responsive app shell, navigation, view-mode preference | 6 |
| Gallery: grid, cards, visible filters, pagination, empty states | 14 |
| Desktop layouts for detail and reveal | 6 |
| Second design pass — desktop breakpoints and the gallery | 8 |
| Wire the typographic system (three families, Cyrillic subsets) | 2 |
| Extract `packages/ui` and `packages/i18n`, add English strings | 8 |
| Component test infrastructure (RTL + happy-dom) | 4 |
| Commit the Chromium harness into CI; add Playwright smoke specs | 6 |
| **Total added** | **~62 h** |

At 8 h/week of coding that is roughly **eight additional weeks**. The plan was ~150 h and
19 weeks to a mid-December soft launch; it becomes **~210 h and ~26 weeks — early
February.**

---

## 4. The strategic call: the gallery should be primary

The plan treated the swipe deck as the product and everything else as support. That was
wrong, and the new requirement makes it clearer.

**Arguments for the gallery being the primary surface:**

- **It is the acquisition channel.** The stack decision identified SEO on animal profile
  pages as the growth mechanism for a project with no marketing budget — links shared into
  Telegram and Facebook groups by shelters and volunteers. A swipe deck is not indexable
  and not linkable. A gallery is both.
- **It is what people expect.** Every adoption site has a browsable list. The absence of one
  reads as a broken product, not as a bold choice.
- **It works everywhere.** One surface serves desktop and mobile, mouse and touch,
  keyboard and screen reader.
- **It suits the data.** With a handful of shelters in one oblast, forty animals is one
  minute of scrolling. A deck forces sequential consumption of a set small enough to see
  at once.
- **Everyone who evaluates this project uses a desktop** — grant reviewers, shelter
  directors, journalists, potential collaborators.

The deck remains the differentiator and should still be built. But it should be a **mode**
you enter, not the front door — and **launch must not be blocked on it.**

That has a practical consequence worth stating plainly: **the swipe deck's remaining work,
including the unresolved iOS failure, comes off the critical path.** It ships when it
works. If iOS Safari turns out to need a week, that week no longer delays launch.

---

## 5. Revised plan

Everything from M6 onward is restructured. M0–M5 stay as history.

### Phase C′ — Consolidate and unblock (~34 h, 4–5 weeks)

Nothing new is built until the foundation supports two form factors and the process can
tell truth from shape.

| # | Work | h |
|---|---|---|
| C1 | **Merge everything.** Land the M4 test follow-up, M5, and the bundler fix. One `main`, one truth | 3 |
| C2 | **Verification gate.** Commit the Chromium harness. Add to CI: `next build`, the harness measuring element rects and driving pointer events, and a rule that a UI definition-of-done item may not be ticked on markup inspection alone | 6 |
| C3 | **Tailwind migration.** Install, port `tokens.ts` into the Tailwind config, convert the deck's inline styles. This unblocks every responsive decision that follows | 8 |
| C4 | **Extract `packages/ui` and `packages/i18n`.** Tokens and primitives out of `features/discovery`; strings out with them; add the English file from the design's string table | 8 |
| C5 | **Wire the typography.** `next/font` with Cyrillic and Latin subsets, `display: swap`. Measure the payload and drop IBM Plex Mono if it does not earn its place | 2 |
| C6 | **Component test infrastructure.** RTL + happy-dom, and one real test per existing component so the setup is proven | 4 |
| C7 | **App shell and navigation.** A real `page.tsx`, a responsive layout, a view-mode switch with a persisted preference | 3 |

**Done when:** `main` is current, CI runs `next build` plus the harness, one component is
rendered and asserted in a test, the app has a home page, and the deck looks identical
after the Tailwind port.

### Phase D′ — Design pass 2 (~8 h, in parallel, not on the keyboard)

Back to Claude Design with the existing system loaded: desktop breakpoints for all eight
screens, and the gallery as a new surface — grid, card, visible filter rail, empty and
loading states, hover and focus, keyboard navigation.

Two constraints carry over unchanged: **freshness stays honest and non-alarming**, and
**fostered animals still get no map pin**.

### Phase E′ — The gallery (~24 h, 3 weeks)

| # | Work | h |
|---|---|---|
| E1 | Gallery grid over `feed.list` — responsive columns, `AnimalCard`, freshness marker reused from the deck | 10 |
| E2 | Filters as a visible rail on desktop, sheet on mobile. Filter state in the URL so results are shareable | 6 |
| E3 | Pagination or infinite scroll over the existing keyset cursor | 4 |
| E4 | Empty, exhausted, loading and error states at both form factors | 4 |

**Done when:** someone browses forty animals on a 1920px desktop and on a 360px phone, filters
on both, and shares a URL that reproduces what they saw.

### Phase F′ — Detail, reveal, history (~22 h, 3 weeks)

The former M6, now responsive from the start rather than retrofitted. Animal detail,
contact reveal, my-reveals list, donation link — each at both form factors.

**This is also where the animal profile page becomes SEO-ready**, which is the acquisition
argument in section 4: proper metadata, Open Graph images, server rendering.

### Phase G′ — Deck completion (~10 h, off the critical path)

iOS investigation and fix, device testing on real hardware, and the deck promoted from
`/discovery` to a proper mode. **Ships when it works. Does not block launch.**

### Phase H′ — Images, admin, i18n, PWA, launch (~50 h)

The former M7–M12, unchanged in substance: image pipeline, internal admin, English copy,
PWA, observability, legal, real shelters. Two additions: desktop layouts for the admin, and
the two count queries the design needs (`feed.count` with animal and shelter counts).

### Revised timeline

| Phase | Weeks | Hours |
|---|---|---|
| C′ Consolidate | 4–5 | 34 |
| D′ Design pass 2 | parallel | 8 |
| E′ Gallery | 3 | 24 |
| F′ Detail & reveal | 3 | 22 |
| G′ Deck completion | off critical path | 10 |
| H′ Remainder to launch | 6–7 | 50 |
| **Total from here** | **~17 weeks** | **~148 h** |

**Soft launch: early February 2027**, assuming 8 h/week of code and 2 h/week of shelter
recruitment. The eight-week slip buys a product that works on every device your users and
your funders actually own.

---

## 6. Process changes

These matter more than the schedule.

**A UI definition-of-done item may not be ticked without rendering.** Element rects
measured, real events driven, a screenshot captured. Text present in HTML is not evidence.

**CI runs `next build`.** Already added. Do not let it be removed.

**"Theoretically possible but practically unlikely" is not a verdict.** Three findings
dismissed that way this week — listener churn, the `transitionend` fragility, the 4:5
geometry conflict — were all real. The reviewer should either verify or record it as
unverified, never as unlikely.

**Verify a plan's premises before approving it.** My M5 build diagnosis was wrong about
`tsconfig` inheritance and the agent implemented it anyway before discovering the truth.
The plan gate works; it only works if both sides check.

**The requirements document needs a "non-negotiables" section.** "Works on desktop" should
have been there from day one. Add it, and re-read it at every milestone gate.

---

## 7. What has not changed

Worth saying, because a course correction can read as a repudiation and this is not one.

The domain model is good and none of it is affected. The contracts are good. The database
layer is good — keyset pagination, HMAC location fuzzing, the verification invariant
enforced in SQL. The security work is good, and the session vulnerability caught in review
would have shipped in most projects. The design direction is good, and the honesty
mechanism at its centre is a real idea that survives everything above.

**~62 hours of new work sits entirely above the API line.** Nothing below it needs to
change, which is the payoff for having built it contract-first.

---

## 8. Do this next, in order

1. Merge the three outstanding branches. One `main`.
2. Add the Chromium harness and `next build` to CI (C2).
3. Tailwind migration (C3) — it blocks every responsive decision after it.
4. Start design pass 2 in parallel; it needs no keyboard time.
5. Extract `packages/ui` and `packages/i18n` (C4).
6. Then the gallery.

And the thing that has not moved all week and still sets the launch date: **shelter
recruitment.** No amount of this matters if the feed is empty in February.
