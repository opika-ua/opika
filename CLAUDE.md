# Opika - repo brief for future sessions


Read this first. It is the always-loaded core: how we work, what is fixed, where to look. Everything
else loads on demand (index below). Do not relitigate the stack, the phase sequence or a design
decision already settled in `docs/`; if something there looks wrong, ask before overriding it.

@docs/standing-constraints.md
@docs/model-policy.md

## Read X when doing Y

| When | Read / use |
|---|---|
| Building or changing UI | `docs/ui/README.md`, `docs/ui/tokens.md`, `docs/ui/components/<Name>.md`; skill `opika-ui`; live kit at `/dev/ui` |
| New page or route | skill `opika-page` |
| Titles, metadata, JSON-LD, sitemap, robots | skill `opika-seo` |
| Any Ukrainian text | skill `opika-copy` |
| Layout or mobile work | skill `opika-responsive` |
| A PR touching SQL or a migration | skill `opika-smoke` |
| Product rules, shelter commitments (`/prytulkam`) | `docs/standing-constraints.md` (imported above) |
| Brand constraints the design must keep | `docs/design/brand-constraints.md` (`docs/design/README.md` is the retired «Реєстр» spec, history only; `docs/ui` replaces it) |
| Stack rationale, prices, versions | `docs/stack-decision.md` |
| Phase plan and status | `docs/build-plan.md` |
| Working in `packages/domain`, `packages/contracts`, handlers, sessions, cursors, location privacy | `docs/history/decisions.md` (settled decisions and obligations the types cannot express) |
| Windows setup, line endings, an import-path build failure | `docs/dev-notes.md` |
| Why a past PR was reviewed or merged as it was | `docs/history/working-loop.md` |
| Full wording of the "test logic, not looks" decision | `docs/history/test-logic-not-looks.md` |

## Working mode: lean (owner, 2026-10-26; overrides older process rules)

The base app is done. Remaining work: design, pre-launch debugging, security audit, launch.
Priority: speed with sensible quality.

1. Separate reviewer only for: migrations or SQL, auth and permissions, R2 writes or deletes,
   GDPR/privacy, security fixes. One round; only blockers get a re-check. Everything else (UI,
   design, copy, docs, tests): CI green plus self-check, then merge.
2. No review-record PRs, no decisions-inbox fold PRs. Decisions go in the feature PR's
   description.
3. One feature = one PR. Split only so a migration lands first.
4. New Ukrainian copy: one table at the start of a task, asked once. Strings from the Figma
   design are approved.
5. Mutation tests and the full Playwright harness only for rule-1 changes.
6. Comments: 1–3 lines, why only. Trim long ones in files you touch.
7. Reports to the owner: ≤10 lines: done / needs Oleksii / next.
8. Smoke sittings only for SQL PRs: fresh Neon child branch, `PROD_NEON_ENDPOINT` set, never
   production - always, with no "no migration, so run it directly" exception (owner,
   2026-10-28, after a sitting told him to do exactly that: `neon-smoke.ts`'s fixture writes are
   disposable only on an actual child branch). PowerShell, `Read-Secret`, one sitting file per
   day. Generate the command block with `pnpm --filter @opika/db smoke-sitting`
   (`packages/db/src/tools/smoke-sitting.ts`), which refuses to render a sitting that says
   otherwise, rather than writing the commands by hand.
9. Fresh session per PR with a short brief; at most four local agents, each with clearly
   separate file ownership. (Owner, 2026-10-28 – raised from two, after a crash recovery ran
   three at once with separate ownership and it worked fine.)
10. If a PR's CI doesn't start, check for a merge conflict with `main` first.
11. Never an em dash (U+2014); use an en dash (U+2013) where a dash is needed; a hyphen only inside words.


## What this is

A swipe-based pet adoption platform connecting adopters with verified
shelters in one Ukrainian oblast. Solo developer, React/TypeScript
background, ~10h/week. MVP scope, with an explicit (documented, not
hand-waved) path through Phases 2-4 - ad revenue, registry integration,
cross-border adoption to Poland/EU.

## The name is not final - keep it out of the domain

"Opika" (Опіка - Ukrainian for guardianship/care, same word as Polish
"opieka") is a **working name**. It is used as the npm workspace scope
(`@opika/contracts`, `@opika/domain`) and nowhere else that matters.

`docs/standing-constraints.md`'s "no brand strings" rule means, concretely:
no `"Opika"` in error messages, schema descriptions, default values, or
comments that would need to change if the name changes. If you need a
product name in output (e.g. an email template, a UI string), it belongs
in an app-level config/i18n message, never in the domain or contract
layer. Renaming the product should never require touching those two
packages.

## Stack - condensed from the ADR, do not re-decide these

| Layer            | Choice                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client           | Next.js 16.3 App Router, PWA (Serwist), React 19.2, React Compiler pinned exact                                                                                                                                          |
| Swipe deck       | Hand-rolled `PointerEvent` + `transform` (no gesture library)                                                                                                                                                            |
| API contract     | oRPC (`@orpc/contract`) in contract-first mode, Zod 4 - **or tRPC v11, undecided, see Open Decisions**                                                                                                                   |
| Server runtime   | Node 24 LTS, inside Next.js route handlers; domain logic framework-free                                                                                                                                                  |
| DB               | Postgres 17 on Neon (Launch, `aws-eu-central-1`), PostGIS available but not enabled at MVP                                                                                                                               |
| ORM              | Drizzle 0.45.x                                                                                                                                                                                                           |
| Images           | Cloudflare R2 + `sharp`-generated variants at upload, served via CF CDN. Never through Vercel's image optimizer                                                                                                          |
| Auth             | Better Auth 1.6.x, self-hosted, `organization` plugin for shelters                                                                                                                                                       |
| i18n             | next-intl 4.13.x + native `Intl` for all dates/numbers/plurals (never Paraglide, never a hand-rolled `MONTHS` array)                                                                                                     |
| Hosting          | Vercel **Pro** since 2026-10-18, with a spend limit set (the ADR's plan; Hobby before that, P-Q7). Hobby's deployment limit and its non-commercial rule no longer constrain anything, so the ads/partners phase is not blocked on the plan. Skew protection is on (12 h maximum age). Only the default branch creates deployments (`git.deploymentEnabled` in `apps/web/vercel.json`, pinned by `vercel-deployments.test.ts`). Images off-platform. Exit ramp: OpenNext → Cloudflare Workers (validate once, don't take yet) |
| Repo             | pnpm 11 workspaces + catalogs. Add Turborepo only when CI exceeds ~3 min                                                                                                                                                 |
| Testing          | Vitest 4 (+ happy-dom & RTL in `apps/web`) + MSW 2 + Playwright rendering harness. Plain Docker PostGIS, not Testcontainers                                                                                                                                  |
| CI               | GitHub Actions, `typecheck → lint → test → build:web → test:harness`                                                                                                                                                                                |
| Backend language | TypeScript, not Go (see ADR §11 for the full argument - the performance delta is ~3ms and irrelevant at this scale; the real cost is losing exhaustive discriminated-union checking and doubling the maintainer surface) |

Full rationale, current version numbers, and pricing sources:
`docs/stack-decision.md`.

## Repo layout

```
opika/
├─ pnpm-workspace.yaml          # catalogs live here
├─ apps/web/                    # adopter PWA and the shelter cabinet (route group)
│  └─ src/ui/                   # the UI kit: every shared component (docs/ui/)
│  └─ src/features/*            # feature code and composites, built from the kit
├─ packages/
│  ├─ contracts/                # Zod schemas + oRPC contract, no implementation
│  ├─ domain/                   # pure TS: FSM, freshness, scoring. No I/O
│  ├─ db/                       # Drizzle schema + repositories
│  ├─ ui/                       # only the cross-app freshness display; the kit is apps/web/src/ui
│  └─ i18n/                     # uk/en message catalogues + lookup helpers
└─ docs/                        # ADR, build plan, standing constraints, docs/ui, docs/history
```

Organise `apps/web` by feature/domain (`features/animals/`, `features/shelters/`, ...), not by
technical type.

## Engineering principles

- SOLID and DRY; composition over inheritance. Contract-first: for `packages/contracts` and
  `packages/domain`, propose type/union shapes for review before the implementation.
- Comments explain why, never what. Performance as a default (keyset pagination, no N+1).
- Prefer native Web APIs and `Intl`; check the ADR's "buy vs build" table (§12) before adding a
  dependency. Pure functions in `packages/domain` need no DB or mock to test.
- No `any`, discriminated unions over booleans, `now` as a parameter, justify every dependency,
  never an em dash (rule 11): all in `docs/standing-constraints.md`.

## Hard constraints for `packages/domain` and `packages/contracts`

- `packages/domain` has **no dependency beyond Zod**. No database driver,
  no Next.js, no `fetch`, no file I/O. Pure functions only - the general
  "`now` is a parameter" rule is in `docs/standing-constraints.md`; this
  is the additional, domain-specific list of what else isn't allowed in.
- `packages/contracts` defines schemas and the API contract shape with
  **no implementation** - routers/handlers live elsewhere.
- No hardcoded brand strings (see "the name is not final," above).

## Phase scope discipline

This repo is built phase-by-phase against `docs/build-plan.md`, whose
Part 1 has the current status of everything through M5 and whose Part 2
is the live phase list. **Do not scaffold ahead of the current phase** -
e.g. do not add a package or a schema table before a phase explicitly
calls for it, even if it would be convenient to stub out. Premature
scaffolding is exactly the kind of thing that turns into stale,
half-wired code in a solo 10h/week project.

## Commands

```bash
corepack enable          # once, machine-wide
pnpm i                   # install - resolves the pinned pnpm automatically
pnpm check                # typecheck -> lint -> test -> build:web -> test:harness, same as CI

# db:migrate, db:seed and onboard:shelter have no root alias - always run them with --filter.
pnpm --filter @opika/db run db:migrate
pnpm --filter @opika/db run db:seed
pnpm --filter @opika/db run onboard:shelter

# Writing to production (Neon) needs an explicit --prod on db:migrate, db:seed and
# onboard:shelter (packages/db/src/prod-guard.ts). Production is identified by its Neon
# endpoint id only (PROD_NEON_ENDPOINT=ep-…, never a URL), read from the environment or,
# for that one key, from the root .env.local. With it unset every non-local target is
# refused (fail closed). Test database setup is local-only with no override.
# db:migrate also takes --expect ep-… (AW-F1): any non-local target must be exactly that Neon
# compute, or it refuses before printing or running anything; a local target takes none.
pnpm typecheck
pnpm lint                 # biome check .
pnpm lint:fix              # biome check --write .
pnpm format                # biome format --write .
pnpm test                 # vitest, all packages
pnpm build:web            # DO NOT REMOVE from check - see "Module resolution"
pnpm test:harness         # Playwright rendering harness against /tvaryny and /tvaryny/gortaty

# One-time, and again after a Playwright version bump:
pnpm --filter @opika/web test:harness:install   # downloads Chromium

docker compose up -d      # local Postgres+PostGIS (postgis/postgis:17-3.5)
docker compose down       # stop it; add -v to also drop the volume

# Each checkout's test databases (opika_test_<hash>, opika_harness_<hash>) are dropped
# when its vitest/harness run ends; KEEP_TEST_DB_ON_FAILURE=1 keeps a failed run's.
# Also kept: after a Ctrl-C'd vitest run (its teardown never runs), after a harness run
# given a CLI --reporter (it replaces the dropping reporter), and while another session
# still uses it (the drop is never forced). The next run reuses it; the prune clears it.
pnpm db:prune-test-dbs        # local only, dry run: lists them, says which checkouts are gone
pnpm db:prune-test-dbs --yes  # drops only those whose recorded checkout no longer exists
```

`pnpm i && pnpm check` must pass on a clean clone (no `node_modules`,
fresh install) before any milestone is considered done - that's the M0
definition of done, and it stays true going forward. Note that M0
reported this passing when it had never been run; "I believe it passes"
is not the same claim as "I ran it and here is the output."


`pnpm build:web` stays a required gate (typecheck cannot catch a bundler-only break); relative
imports are extensionless. Details: `docs/dev-notes.md`.

## Test logic, not looks

Until the brand lands (owner, 2026-10-17, 2026-10-20): tests assert behaviour (domain, contract,
handler, flows found by role/label/text, keyboard, aria-live), never appearance. Two accessibility
tests stay: the shared controls' computed min-height is at least 48px, and a focused control shows
an indicator. New components use the token set only (`docs/ui/tokens.md`). Full wording and what was
removed: `docs/history/test-logic-not-looks.md`.

## Non-negotiable test suites

Two suites are called out specifically because skipping them is how a
solo project quietly accumulates the exact bugs they'd catch:

1. **The shelter verification FSM transition table.** Exhaustive -
   every `(state, event)` pair, including the ones that must be
   rejected (e.g. `verified` cannot go directly to `pending`). ~50 lines,
   catches "we forgot the re-verify-after-suspension case" before it's a
   production incident.
2. **Ukrainian plural/freshness boundaries** at 1, 2, 5, 11, 21, 22 days.
   `Intl.RelativeTimeFormat` gets Ukrainian's four plural forms right for
   free, but only if it's called with the right unit and sign - test
   that you're calling it right, not that `Intl` works.


## Supply-chain note (why a version pin looks slightly stale)

pnpm 11's `minimumReleaseAge` defaults to 1440 minutes (24h) - a newly
published package version won't resolve until it's a day old. This is
deliberate and should stay on; it would have blocked the 2025 npm
Shai-Hulud worm incidents entirely. If `pnpm-workspace.yaml`'s catalog
pins a version one patch behind npm's absolute latest, that's usually
why - it's the newest version that's already cleared quarantine. Don't
"fix" this by bumping to `latest` and adding a `minimumReleaseAgeExclude`
entry; wait a day, or pick the next-newest cleared version instead.
