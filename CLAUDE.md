# Opika — repo brief for future sessions

Read this before doing anything else in this repo. It exists so a future
session (or a future you) doesn't have to re-derive decisions that are
already made. The two source documents this brief distills are in
`docs/`: `docs/stack-decision.md` (the ADR — full rationale, sources,
verified prices/versions as of 2026-08-05) and `docs/build-plan.md` (the
milestone plan and hour budget). **Both are the source of truth for their
respective domains. Do not relitigate a stack choice or a milestone
sequence that's already settled in those docs — if something there looks
wrong, ask before overriding it.**

## What this is

A swipe-based pet adoption platform connecting adopters with verified
shelters in one Ukrainian oblast. Solo developer, React/TypeScript
background, ~10h/week. MVP scope, with an explicit (documented, not
hand-waved) path through Phases 2–4 — ad revenue, registry integration,
cross-border adoption to Poland/EU.

## The name is not final — keep it out of the domain

"Opika" (Опіка — Ukrainian for guardianship/care, same word as Polish
"opieka") is a **working name**. It is used as the npm workspace scope
(`@opika/contracts`, `@opika/domain`) and nowhere else that matters.

**Hard rule: no hardcoded brand strings in `packages/domain` or
`packages/contracts`.** No `"Opika"` in error messages, schema
descriptions, default values, or comments that would need to change if
the name changes. If you need a product name in output (e.g. an email
template, a UI string), it belongs in an app-level config/i18n message,
never in the domain or contract layer. Renaming the product should never
require touching those two packages.

## Stack — condensed from the ADR, do not re-decide these

| Layer | Choice |
|---|---|
| Client | Next.js 16.3 App Router, PWA (Serwist), React 19.2, React Compiler pinned exact |
| Swipe deck | Hand-rolled `PointerEvent` + `transform` (no gesture library) |
| API contract | oRPC (`@orpc/contract`) in contract-first mode, Zod 4 — **or tRPC v11, undecided, see Open Decisions** |
| Server runtime | Node 24 LTS, inside Next.js route handlers; domain logic framework-free |
| DB | Postgres 17 on Neon (Launch, `aws-eu-central-1`), PostGIS available but not enabled at MVP |
| ORM | Drizzle 0.45.x |
| Images | Cloudflare R2 + `sharp`-generated variants at upload, served via CF CDN. Never through Vercel's image optimizer |
| Auth | Better Auth 1.6.x, self-hosted, `organization` plugin for shelters |
| i18n | next-intl 4.13.x + native `Intl` for all dates/numbers/plurals (never Paraglide, never a hand-rolled `MONTHS` array) |
| Hosting | Vercel Pro at MVP, spend cap on day one, images off-platform. Exit ramp: OpenNext → Cloudflare Workers (validate once, don't take yet) |
| Repo | pnpm 11 workspaces + catalogs. Add Turborepo only when CI exceeds ~3 min |
| Testing | Vitest 4 + RTL + MSW 2 + 4–6 Playwright specs. Plain Docker PostGIS, not Testcontainers |
| CI | GitHub Actions, `typecheck → lint → test` |
| Backend language | TypeScript, not Go (see ADR §11 for the full argument — the performance delta is ~3ms and irrelevant at this scale; the real cost is losing exhaustive discriminated-union checking and doubling the maintainer surface) |

Full rationale, current version numbers, and pricing sources:
`docs/stack-decision.md`.

## Repo layout (target shape — most of this doesn't exist yet)

```
opika/
├─ pnpm-workspace.yaml          # catalogs live here
├─ apps/
│  ├─ web/                      # adopter PWA — NOT created yet (M4+)
│  └─ partner/                  # only if the shelter dashboard ever splits out; starts as a route group in apps/web
├─ packages/
│  ├─ contracts/                # Zod schemas + oRPC/tRPC contract — M1
│  ├─ domain/                   # pure TS: FSM, freshness, scoring. No I/O. — M1
│  ├─ db/                       # Drizzle schema + repositories — M2, not yet
│  ├─ ui/                       # shared primitives — later
│  └─ i18n/                     # message catalogues + Intl formatters — later
├─ docs/                        # this repo's copies of the ADR and build plan
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
- **Zero tolerance for `any`.** Discriminated unions and generics over
  booleans and string enums. If you're tempted by a boolean flag plus a
  comment explaining what it means in each state, it's a union.
- **Contract-first.** Types and Zod schemas are defined and reviewed
  *before* implementation. For `packages/contracts` and
  `packages/domain` specifically: propose the type/union shapes for
  review before writing the implementing code or tests.
- **Clean code.** Self-documenting names. Comments explain *why* a
  business rule exists (e.g. why `suspended` carries `priorStatus`), not
  what the code does.
- **Performance as a default**, not an afterthought, once there's a UI to
  optimize: code-splitting, tree-shaking, memoization. Target: this
  should hold up cleanly past 300k MAU without an architecture change —
  see the ADR's RPS math in §11.1 for what that actually requires (it's
  keyset pagination and N+1 elimination, not language choice).
- **Lean dependencies.** Justify every package added. Prefer native Web
  APIs / native `Intl` over a library. The ADR's "buy vs build" table
  (§12) is the existing list of what's already been decided either way —
  check it before reaching for a new dependency in a covered area.
- **Modular by feature/domain**, not by technical layer.
- **Testable and observable by construction.** Pure functions in
  `packages/domain` are the cheapest tests in the codebase — if a domain
  function needs a DB or a mock to test, that's a design smell, not a
  testing problem.

## Hard constraints for `packages/domain` and `packages/contracts`

- `packages/domain` has **no dependency beyond Zod**. No database driver,
  no Next.js, no `fetch`, no file I/O, no `Date.now()` inside a function
  that should be pure (pass `now` in). Pure functions only.
- `packages/contracts` defines schemas and the API contract shape with
  **no implementation** — routers/handlers live elsewhere.
- No hardcoded brand strings (see "the name is not final," above).
- Every state that isn't a boolean is a discriminated union with the
  distinguishing field named consistently (`kind`, `status`, or
  `source` — pick per type and stay consistent within that type).

## Milestone scope discipline

This repo is being built milestone-by-milestone against `docs/build-plan.md`.
**Do not scaffold ahead of the current milestone** — e.g. do not add a
Next.js app or a Drizzle/database schema until M2 explicitly calls for
it, even if it would be convenient to stub out. Premature scaffolding is
exactly the kind of thing that turns into stale, half-wired code in a
solo 10h/week project.

- **M0 — repo & tooling: done.** pnpm 11 workspace with catalogs,
  `packageManager` pinned via corepack, strict base `tsconfig.base.json`
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  plus a few more — see the file), Biome for lint+format,
  `docker-compose.yml` (`postgis/postgis:17-3.5`), `.gitattributes` +
  autocrlf guidance below, GitHub Actions CI (`typecheck → lint → test`).
- **M1 — `packages/contracts` + `packages/domain`: in progress.** Branded
  IDs, `Money`, `Shelter` + verification FSM with an exhaustive
  transition-table test, `Animal` with discriminated vaccination/spay-neuter
  unions, `AdopterProfile` + `FeedFilters`, `ContactReveal`, `Freshness` +
  `freshnessOf`, `scoreAnimal`, and the API contract for ~8 procedures.
  Type design gets reviewed before implementation — see Open Decisions.
- **M2 and later:** persistence (Drizzle), seed data, the minimal API,
  the swipe deck, filters/reveal, images, admin, i18n, PWA, observability,
  launch. Not in scope until M1 is reviewed and signed off. Full detail
  in `docs/build-plan.md`.

## Open decisions — ask before assuming

These are flagged in the ADR as genuinely open, or were raised during M1
scoping. **Do not pick a default silently — ask.**

1. **oRPC vs tRPC v11** for the contract layer. ADR recommends oRPC
   (contract-first is its native model, OpenAPI emission, smaller
   client) with tRPC v11 as the conservative fallback (oRPC 2.0 is in
   beta as of the ADR's writing). Affects how `packages/contracts` is
   structured. Ask before writing the ~8 procedure definitions.
2. **Exact address vs. approximate shelter location** before contact is
   revealed. Changes the `Shelter` schema shape (what's public on the
   feed/profile vs. what's only in `ContactReveal`'s shelter snapshot).
   Ask before writing the `Shelter` schema.
3. **Size and age bucket definitions** for `Animal` and `FeedFilters`.
   Propose options grounded in how Ukrainian shelters actually describe
   animals; don't assume a Western breed-standard bucketing.

Once answered, update this section (replace the open item with the
decision and a one-line reason) so the next session doesn't re-ask.

## Non-negotiable test suites

Two suites are called out specifically because skipping them is how a
solo project quietly accumulates the exact bugs they'd catch:

1. **The shelter verification FSM transition table.** Exhaustive —
   every `(state, event)` pair, including the ones that must be
   rejected (e.g. `verified` cannot go directly to `pending`). ~50 lines,
   catches "we forgot the re-verify-after-suspension case" before it's a
   production incident.
2. **Ukrainian plural/freshness boundaries** at 1, 2, 5, 11, 21, 22 days.
   `Intl.RelativeTimeFormat` gets Ukrainian's four plural forms right for
   free, but only if it's called with the right unit and sign — test
   that you're calling it right, not that `Intl` works.

## Windows development notes

You're developing on Windows. Two things matter here:

- **Line endings:** `.gitattributes` normalizes everything to LF on
  checkin regardless of platform (`* text=auto eol=lf`), which is the
  primary defense. On top of that, set `git config --global core.autocrlf
  true` (Windows convention: LF in the repo, CRLF in your working tree) —
  it's a global one-time setting, so do it once outside any repo-specific
  tooling, not something this repo's config can set for you.
- **corepack:** run `corepack enable` once (may need an elevated
  terminal the first time on Windows). After that, `pnpm` resolves to
  the exact version pinned in `package.json`'s `packageManager` field —
  don't install pnpm globally via npm.

## Commands

```bash
corepack enable          # once, machine-wide
pnpm i                   # install — resolves the pinned pnpm automatically
pnpm check                # typecheck -> lint -> test, same as CI
pnpm typecheck
pnpm lint                 # biome check .
pnpm lint:fix              # biome check --write .
pnpm format                # biome format --write .
pnpm test

docker compose up -d      # local Postgres+PostGIS (postgis/postgis:17-3.5)
docker compose down       # stop it; add -v to also drop the volume
```

`pnpm i && pnpm check` must pass on a clean clone (no `node_modules`,
fresh install) before any milestone is considered done — that's the M0
definition of done, and it stays true going forward.

## Supply-chain note (why a version pin looks slightly stale)

pnpm 11's `minimumReleaseAge` defaults to 1440 minutes (24h) — a newly
published package version won't resolve until it's a day old. This is
deliberate and should stay on; it would have blocked the 2025 npm
Shai-Hulud worm incidents entirely. If `pnpm-workspace.yaml`'s catalog
pins a version one patch behind npm's absolute latest, that's usually
why — it's the newest version that's already cleared quarantine. Don't
"fix" this by bumping to `latest` and adding a `minimumReleaseAgeExclude`
entry; wait a day, or pick the next-newest cleared version instead.
