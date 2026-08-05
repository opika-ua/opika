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
- **M1 — `packages/contracts` + `packages/domain`: built, pending your
  sign-off.** Branded IDs, `Money`, `Shelter` + verification FSM with an
  exhaustive transition-table test, `Animal` with discriminated
  vaccination/spay-neuter unions, `AdopterProfile` + `FeedFilters`,
  `ContactReveal`, `Freshness` + `freshnessOf`, `scoreAnimal`, `City`, and
  the API contract for the eight procedures. 137 tests. The reviewed type
  design is `docs/m1-type-design.md` — read it before changing a shape in
  either package, because most of them are decisions rather than defaults.
- **M2 and later:** persistence (Drizzle), seed data, the minimal API,
  the swipe deck, filters/reveal, images, admin, i18n, PWA, observability,
  launch. Not in scope until M1 is reviewed and signed off. Full detail
  in `docs/build-plan.md`.

## Decisions made during M1 scoping (settled — don't re-ask)

1. **Contract layer: oRPC, on the stable 1.x line** (not the 2.0 beta).
   Matches the contract-first principle natively; keep every procedure
   definition in `packages/contracts` as a thin declarative object so a
   future 1.x→2.0 migration stays a one-package job. tRPC v11 remains the
   documented fallback if oRPC 1.x causes real friction.
2. **Shelter location: approximate until reveal.** `Shelter.publicLocation`
   (city/district/fuzzed lat-lng) is what the feed and profile expose;
   `Shelter.exactAddress` exists on the domain object but is never part
   of the public-facing contract type (`PublicShelterSchema` omits it).
   The exact address only reaches an adopter inside
   `ContactReveal.shelterSnapshot`, after they've committed to a reveal.
   Same gating pattern as contact info — not a special case.
3. **Size buckets: 3-tier** — `small` / `medium` / `large`. Weight is
   **never stored**, only the bucket. `SIZE_BUCKET_WEIGHT_HINTS_KG`
   (<10kg / 10–25kg / 25kg+) exists purely as guidance for whoever fills in
   the listing. *(Superseded the earlier 4-tier `giant` variant — that tier
   is gone, deliberately, not by oversight.)*
4. **Age buckets:** 4-tier, Petfinder-style — `baby` (<1yr) / `young`
   (1–3yr) / `adult` (3–8yr) / `senior` (8yr+). **The bucket is derived, not
   stored.** `Animal.age` holds an `AgeEstimate` (a birth date, or a bucket
   declared at a known time) and `ageBucketOf(estimate, now)` computes the
   bucket at read time, so a puppy listed in March is not still advertised
   as a puppy in December.

## Decisions settled during the M1 build (also don't re-ask)

5. **Verification FSM edges.** 5 states × 6 events = 30 pairs, all asserted.
   Open: `pending → rejected` (a rejection always has a moderator behind it;
   requiring a formal review first on spam models a click, not a lifecycle)
   and `suspended → rejected` (otherwise `suspended` means both "paused, may
   return" and "banned"). Closed: `under_review → suspended` (nothing to
   suspend — it isn't in the feed) and `verified → under_review` (it would
   drop a shelter from the feed with no record it was ever verified, which is
   what `priorStatus` exists to prevent). Periodic re-verification, when
   needed, is a **new `re_review` state** carrying its prior status — not an
   overload of `under_review`.
6. **`VerificationEvidence` is a list of discriminated items**, not a fixed
   record, because what a shelter can produce depends on its legal form. The
   requirement rule therefore lives in `DEFAULT_VERIFICATION_POLICY` as a
   pure predicate. An **unregistered volunteer group can reach `verified`**,
   substituting a moderator site visit plus two independent references for
   the registration and banking records a registered entity supplies.
   ⚠ Those thresholds are my proposal, not your specification — the shape is
   settled, the numbers are yours to change.
7. **`RejectionReason` and `SuspensionReason` are separate code lists**
   (+ optional free-text note). A shelter is rejected for reasons about its
   application and suspended for reasons about its conduct; one merged enum
   would be mostly invalid in either context.
8. **Species stays closed at `dog | cat`.** Adding a literal later is a
   compiler-guided edit; an open `other` variant would make the feed filter
   permanently unenumerable and break the weight hints, which describe dogs
   and cats.
9. **`swipes.record` and `animals.reveal` stay separate.** Swipes are
   best-effort and batchable; a reveal is transactional, idempotent and
   append-only, and is the Phase 2 reward-ledger event.
10. **Feed ordering: keyset on `(lastUpdatedAt DESC, id)`**, with
    `scoreAnimal` re-ranking within the fetched page. No materialised score
    column, so no recompute job as freshness decays and no backfill when the
    weights are tuned. The accepted cost: de-ranking stale listings is a
    within-page effect, not a global ordering. **M2 implements this.**
11. **Coordinate fuzzing: 1 km, one global policy.** `fuzzCoordinates` is
    deterministic on the shelter id — a per-request offset would let an
    observer average repeated samples back to the true position.
12. **Public views are built with `pick`, never `omit`.** `omit` is
    allow-by-default and would leak a newly added `Shelter` field silently;
    `pick` breaks the build until someone decides. Non-negotiable, given
    that what's being withheld is an exact address.

## Obligations the contract cannot express — carry these into M2/M4

Found during the M1 review (`docs/m1-review.md`). Each is something the
type system genuinely cannot enforce, so it has to live in a checklist:

- **Build the server with `implement(contract)`.** oRPC validates outputs
  at runtime and returns the *stripped* object — verified in
  `@orpc/server@1.14.14` — but only when a schema is attached. A handler
  on the plain `os` builder with no `.output()` returns whatever the
  handler produced, and the `pick`-based leak protection evaporates.
- **The session cookie is server-minted only**: ≥128 bits from a CSPRNG,
  HttpOnly + Secure + SameSite=Lax, and *reject* an unknown session id
  rather than treating it as a new one. Get-or-create on a client-supplied
  value is account takeover.
- **Sign the cursor and bind it to the filters.** Payload carries a kind
  tag (`feed` / `reveal`) and `filtersFingerprint(filters)`; a mismatch is
  `INVALID_CURSOR`. The branded type is a convenience for honest callers
  and provides nothing at a trust boundary.
- **Clamp `swipes.record`'s `at`** to `[now - maxOfflineWindow, now]`.
- **Never construct a `PublicLocation` by hand** — `publicLocationOf` is
  the only sanctioned path, and the branded `FuzzedCoordinates` enforces
  it. The `LocationPrivacyPolicy.digest` must be an HMAC over a
  server-held key; `insecureUnkeyedDigest` is for tests and seed data.
- **Keep evidence documents out of the public image bucket.** Animal
  photo keys are public; `documentKey` on verification evidence is the
  same kind of value pointing at shelter registration paperwork.
- **Store `age_anchor_at`** (from `ageAnchorOf`) as the indexed column and
  filter with `ageAnchorRange`, rather than storing the age union.
- **Denormalise `city_id` onto animals** as a persistence projection, and
  put equality columns before the ordering tuple in the feed index.

## Still open in M1

- The evidence item list and the two reason code lists are proposals, not
  specifications (see 6 and 7 above). The **shapes** are settled; changing a
  code or a threshold is a one-line edit plus a test.
- `Money` is deliberately unattached to any entity. Adding
  `Animal.adoptionFee` would invite recording exactly the "symbolic fee" the
  EU enforcement guidance flags, so it waits for a real requirement.

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

- **Line endings:** `.gitattributes`' `* text=auto eol=lf` doesn't just
  normalize line endings *in the repo* — the `eol=lf` attribute overrides
  `core.autocrlf` for every matched file (which is all of them) and forces
  LF in your working tree too, on Windows included. That's deliberate:
  it means every tracked file is LF on disk regardless of what
  `core.autocrlf` is set to, so there's nothing else to configure for
  files this repo already tracks. Modern editors (VS Code, WebStorm) save
  LF files as LF without complaint. `core.autocrlf` still matters for
  *new, untracked* files you create before they're covered by a
  `.gitattributes` pattern — `git config --global core.autocrlf input` is
  the safer default on Windows (normalizes CRLF→LF on commit, doesn't
  force CRLF back on checkout), but don't expect it to change anything
  for files already in this repo.
- **corepack:** run `corepack enable` once (may need an elevated
  terminal the first time on Windows). After that, `pnpm` resolves to
  the exact version pinned in `package.json`'s `packageManager` field —
  don't install pnpm globally via npm. Node 24 (this project's pinned
  major) still bundles Corepack; Node 25+ drops it from the default
  distribution, so a future Node upgrade will need `npm install -g
  corepack` first. In CI, prefer `corepack enable && corepack install`
  (activates the pinned version explicitly) over a bare `corepack enable`
  followed by an implicit lazy download — the latter can hit Corepack's
  interactive download-confirmation prompt, which doesn't reliably
  suppress via `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` on every Corepack
  version. See `.github/workflows/ci.yml` for the pattern in practice.

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
