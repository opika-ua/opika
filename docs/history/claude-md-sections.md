# Superseded CLAUDE.md sections (pre DS PR 5)

The old intro, repo layout and engineering principles, moved verbatim when CLAUDE.md was slimmed. Current versions are in CLAUDE.md (shorter); the long dash-rule history is also in docs/standing-constraints.md.
Note: `docs/design/README.md` named below is the retired «Реєстр» spec (history); the current design docs are `docs/ui/`.

Read this before doing anything else in this repo. It exists so a future
session (or a future you) doesn't have to re-derive decisions that are
already made. The four source documents this brief distills are in
`docs/`: `docs/stack-decision.md` (the ADR - full rationale, sources,
verified prices/versions as of 2026-08-05), `docs/build-plan.md` (the
phase plan and hour budget), `docs/design/README.md` (the "Keeper's
Voice" design handoff - tokens, typography, spacing, motion, gesture
spec, string table, all eight screens, and the gallery + desktop
breakpoints), and `docs/standing-constraints.md` (imported below - the
rules that apply to every phase, every pull request, every agent).
**All four are the source of truth for their respective domains. Do not
relitigate a stack choice, a phase sequence, or a design decision that's
already settled in those docs - if something there looks wrong, ask
before overriding it.**

@docs/standing-constraints.md


## Repo layout

```
opika/
├─ pnpm-workspace.yaml          # catalogs live here
├─ apps/
│  └─ web/                      # adopter PWA. apps/partner only if the shelter dashboard
│                                 ever splits out; starts as a route group in apps/web
├─ packages/
│  ├─ contracts/                # Zod schemas + oRPC contract - M1, done
│  ├─ domain/                   # pure TS: FSM, freshness, scoring. No I/O. - M1, done
│  ├─ db/                       # Drizzle schema + repositories - M2, done
│  ├─ ui/                       # shared primitives - Phase C4, done. Genuinely cross-feature
│  │                              only (freshness display today); feature-local UI stays in
│  │                              apps/web/src/features/*, not here
│  └─ i18n/                     # uk/en message catalogues - Phase C4, done. Intl formatters
│                                 (relative-time, plurals) stay in packages/domain, which
│                                 already had them. Also small lookup helpers over the
│                                 catalogues (ageBucketLabel/sizeLabel, E1) shared between
│                                 the deck and the gallery - next-intl itself isn't wired
│                                 until H3
├─ docs/                        # this repo's copies of the ADR, build plan, design, standing constraints
└─ infra/ (docker-compose.yml lives at repo root instead, see below)
```

Inside any future `apps/web`, organize by feature/domain
(`features/animals/`, `features/shelters/`, `features/discovery/` for the
swipe deck, etc.), not by technical type (`components/`, `hooks/` as
top-level folders). This is a standing convention, not just an M-numbered
task.

## Engineering principles (apply to every package in this repo)

- **SOLID + DRY.** Composition over inheritance. Structure props/APIs so
  flexibility doesn't require prop-drilling.
- **Contract-first.** Types and Zod schemas are defined and reviewed
  _before_ implementation. For `packages/contracts` and
  `packages/domain` specifically: propose the type/union shapes for
  review before writing the implementing code or tests.
- **Clean code.** Self-documenting names. Comments explain _why_ a
  business rule exists (e.g. why `suspended` carries `priorStatus`), not
  what the code does.
- **Performance as a default**, not an afterthought, once there's a UI to
  optimize: code-splitting, tree-shaking, memoization. Target: this
  should hold up cleanly past 300k MAU without an architecture change -
  see the ADR's RPS math in §11.1 for what that actually requires (it's
  keyset pagination and N+1 elimination, not language choice).
- **Prefer native Web APIs / native `Intl`** over a library even where a
  dependency would be justified. The ADR's "buy vs build" table (§12) is
  the existing list of what's already been decided either way - check it
  before reaching for a new dependency in a covered area.
- **Modular by feature/domain**, not by technical layer.
- **Testable and observable by construction.** Pure functions in
  `packages/domain` are the cheapest tests in the codebase - if a domain
  function needs a DB or a mock to test, that's a design smell, not a
  testing problem.
- **Never an em dash (U+2014 "U+2014").** Where a dash is needed, use an en dash
  (U+2013 "–") – spaced between clauses, unspaced in a range. A plain hyphen
  is for compound words only, never a clause separator. Owner, 2026-10-26,
  final wording – supersedes an earlier same-day "hyphen everywhere, ban the
  en dash too" phrasing that #206 had already merged; see
  `docs/standing-constraints.md`'s Code section for the full history,
  including what that supersession leaves known-wrong on `main` pending a
  follow-up PR. A verbatim quote of someone's own words, or of an external
  source, is exempt – it stays character-exact, dashes included; guarded for
  copy and metadata by `apps/web/src/no-em-en-dash.test.ts`.

(No `any`, discriminated unions over booleans, `now` as a parameter,
justify every dependency - `docs/standing-constraints.md`, not restated
here.)

