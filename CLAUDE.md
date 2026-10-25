# Opika — repo brief for future sessions

Read this before doing anything else in this repo. It exists so a future
session (or a future you) doesn't have to re-derive decisions that are
already made. The four source documents this brief distills are in
`docs/`: `docs/stack-decision.md` (the ADR — full rationale, sources,
verified prices/versions as of 2026-08-05), `docs/build-plan.md` (the
phase plan and hour budget), `docs/design/README.md` (the "Keeper's
Voice" design handoff — tokens, typography, spacing, motion, gesture
spec, string table, all eight screens, and the gallery + desktop
breakpoints), and `docs/standing-constraints.md` (imported below — the
rules that apply to every phase, every pull request, every agent).
**All four are the source of truth for their respective domains. Do not
relitigate a stack choice, a phase sequence, or a design decision that's
already settled in those docs — if something there looks wrong, ask
before overriding it.**

@docs/standing-constraints.md

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

`docs/standing-constraints.md`'s "no brand strings" rule means, concretely:
no `"Opika"` in error messages, schema descriptions, default values, or
comments that would need to change if the name changes. If you need a
product name in output (e.g. an email template, a UI string), it belongs
in an app-level config/i18n message, never in the domain or contract
layer. Renaming the product should never require touching those two
packages.

## Stack — condensed from the ADR, do not re-decide these

| Layer            | Choice                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client           | Next.js 16.3 App Router, PWA (Serwist), React 19.2, React Compiler pinned exact                                                                                                                                          |
| Swipe deck       | Hand-rolled `PointerEvent` + `transform` (no gesture library)                                                                                                                                                            |
| API contract     | oRPC (`@orpc/contract`) in contract-first mode, Zod 4 — **or tRPC v11, undecided, see Open Decisions**                                                                                                                   |
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
| Backend language | TypeScript, not Go (see ADR §11 for the full argument — the performance delta is ~3ms and irrelevant at this scale; the real cost is losing exhaustive discriminated-union checking and doubling the maintainer surface) |

Full rationale, current version numbers, and pricing sources:
`docs/stack-decision.md`.

## Repo layout

```
opika/
├─ pnpm-workspace.yaml          # catalogs live here
├─ apps/
│  └─ web/                      # adopter PWA. apps/partner only if the shelter dashboard
│                                 ever splits out; starts as a route group in apps/web
├─ packages/
│  ├─ contracts/                # Zod schemas + oRPC contract — M1, done
│  ├─ domain/                   # pure TS: FSM, freshness, scoring. No I/O. — M1, done
│  ├─ db/                       # Drizzle schema + repositories — M2, done
│  ├─ ui/                       # shared primitives — Phase C4, done. Genuinely cross-feature
│  │                              only (freshness display today); feature-local UI stays in
│  │                              apps/web/src/features/*, not here
│  └─ i18n/                     # uk/en message catalogues — Phase C4, done. Intl formatters
│                                 (relative-time, plurals) stay in packages/domain, which
│                                 already had them. Also small lookup helpers over the
│                                 catalogues (ageBucketLabel/sizeLabel, E1) shared between
│                                 the deck and the gallery — next-intl itself isn't wired
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
  should hold up cleanly past 300k MAU without an architecture change —
  see the ADR's RPS math in §11.1 for what that actually requires (it's
  keyset pagination and N+1 elimination, not language choice).
- **Prefer native Web APIs / native `Intl`** over a library even where a
  dependency would be justified. The ADR's "buy vs build" table (§12) is
  the existing list of what's already been decided either way — check it
  before reaching for a new dependency in a covered area.
- **Modular by feature/domain**, not by technical layer.
- **Testable and observable by construction.** Pure functions in
  `packages/domain` are the cheapest tests in the codebase — if a domain
  function needs a DB or a mock to test, that's a design smell, not a
  testing problem.

(No `any`, discriminated unions over booleans, `now` as a parameter,
justify every dependency — `docs/standing-constraints.md`, not restated
here.)

## Hard constraints for `packages/domain` and `packages/contracts`

- `packages/domain` has **no dependency beyond Zod**. No database driver,
  no Next.js, no `fetch`, no file I/O. Pure functions only — the general
  "`now` is a parameter" rule is in `docs/standing-constraints.md`; this
  is the additional, domain-specific list of what else isn't allowed in.
- `packages/contracts` defines schemas and the API contract shape with
  **no implementation** — routers/handlers live elsewhere.
- No hardcoded brand strings (see "the name is not final," above).

## Phase scope discipline

This repo is built phase-by-phase against `docs/build-plan.md`, whose
Part 1 has the current status of everything through M5 and whose Part 2
is the live phase list. **Do not scaffold ahead of the current phase** —
e.g. do not add a package or a schema table before a phase explicitly
calls for it, even if it would be convenient to stub out. Premature
scaffolding is exactly the kind of thing that turns into stale,
half-wired code in a solo 10h/week project.

## Decisions made during M1 scoping (settled — don't re-ask)

1. **Contract layer: oRPC, on the stable 1.x line** (not the 2.0 beta).
   Matches the contract-first principle natively; keep every procedure
   definition in `packages/contracts` as a thin declarative object so a
   future 1.x→2.0 migration stays a one-package job. tRPC v11 remains the
   documented fallback if oRPC 1.x causes real friction.
2. **Shelter location: the city only, before and after a reveal.** Public
   views carry the city and nothing finer (no district, no coordinates).
   `Shelter.exactAddress` exists on the domain object but never leaves the
   server for adopters: not in `PublicShelterSchema`, not in the
   `ContactReveal` views. A reveal discloses contact channels only; the
   meeting place is agreed with the shelter in correspondence.
   **Revised 2026-10-15 (Oleksii, inbox EM-D1).**
3. **Size buckets: 3-tier** — `small` / `medium` / `large`. Weight is
   **never stored**, only the bucket. `SIZE_BUCKET_WEIGHT_HINTS_KG`
   (<10kg / 10–25kg / 25kg+) exists purely as guidance for whoever fills in
   the listing. _(Superseded the earlier 4-tier `giant` variant — that tier
   is gone, deliberately, not by oversight.)_
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
10. **Feed ordering: keyset on `(last_confirmed_at DESC, id)`**, with
    `scoreAnimal` re-ranking within the fetched page. No materialised score
    column, so no recompute job as freshness decays and no backfill when the
    weights are tuned. The accepted cost: de-ranking stale listings is a
    within-page effect, not a global ordering. **M2 implemented this** on
    `lastUpdatedAt`. **Revised 2026-10-07 (H2-3, Oleksii's answer in
    `docs/decisions-inbox.md`):** the key, freshness
    itself and the gallery's `freshest` sort all moved to `last_confirmed_at`
    (`listing.confirmedAt`, set at publish and by «Ще шукає»). `lastUpdatedAt`
    is edit time, and once shelters can edit, a typo fix must not make an old
    card read as fresh or jump the queue. Backfilled from `last_updated_at`
    (H2-14), never from `created_at`, because a listing's creation is not a
    confirmation.
11. **Coordinate fuzzing: 1 km, one global policy.** `fuzzCoordinates` is
    deterministic on the shelter id — a per-request offset would let an
    observer average repeated samples back to the true position.
12. **`pick`, never `omit`, decided here first** — for `Shelter`
    specifically, where what's withheld is the exact address. Generalised
    into a standing rule in `docs/standing-constraints.md`; this entry
    just records that M1 is where and why it started.

## Decisions settled during M4 (also don't re-ask)

13. **Anonymous device session is hand-rolled, not Better Auth.** Better Auth's
    value is the `organization` plugin for shelter accounts at M8; the anonymous
    session is a simpler primitive. Token: ≥256 bits from `crypto.randomBytes`,
    hex-encoded. Storage: SHA-256 hash of the token (never the token itself).
    Lookup: timing-safe comparison. Cookie: `__Host-session` in production
    (falls back to `session` in dev, where HTTPS is unavailable). Behaviour:
    get-or-reject, never get-or-create. Expiry: absolute (30 days) AND idle
    (7 days). The domain's `AdopterIdentity.anonymous.deviceSessionId` stores
    the hash, not the token. Better Auth is deferred to M8, where it replaces
    the anonymous session for adopters who upgrade to a real account and provides
    the organization plugin for shelters.
14. **Rate limiting is split.** Generic per-IP: in-memory sliding window behind
    a `RateLimiter` interface (acknowledged per-instance in serverless; the
    interface is stable for a Redis/KV swap). Reveal limit: Postgres-persisted,
    30 per 24h, counted from the existing `reveals` table — no new table needed,
    survives cold starts. **Correction, 2026-09-10:** the 30 counts *distinct
    shelters revealed*, not reveal rows — `reveals.shelter_id` was already on
    the row (decision unchanged), so no migration; the check gained a second
    query (a free-re-reveal existence check ahead of the distinct-count one).
    Contacts are scrapeable per shelter, not per animal; re-revealing a
    shelter already seen in the window is free, and does not consume a unit.
    See `apps/web/src/api/reveal-rate-limit.ts`'s own doc comment for the full
    reasoning and its connection to the deck's gesture-parity decision.
15. **Cursor is HMAC-signed.** `CURSOR_HMAC_SECRET` env var (separate from
    `LOCATION_HMAC_SECRET`). Payload carries a `kind` tag (`feed` / `reveal`)
    and `filtersFingerprint(filters)`; verification is timing-safe. Prevents
    cross-list and cross-filter cursor reuse.

## Decisions settled during gallery contract reconciliation (also don't re-ask)

Full reasoning for all five: `docs/gallery-contract-decisions.md`. Implemented in
Phase E (`docs/build-plan.md`), not yet built as of this entry.

16. **`AnimalListingState`'s `reserved` variant gains `publishedAt`, alongside its
    existing `since`.** Same shape as decision #5's `suspended` carrying
    `priorStatus`, for the same reason: without it, `reserved` means both "just
    became unavailable" and "has waited the longest of anyone on the page,"
    and a sort named longest-waiting needs the second meaning, not the first.
    Reserved animals stay in the feed deliberately (reservations fall through),
    so the one that's waited longest and is provisionally spoken for is exactly
    the one that should stay visible. Requires a backfill across the 320 seeded
    rows — a domain type change, not a pure addition.
17. **Gallery pagination is OFFSET, by name and in writing an exception to
    "keyset, never OFFSET."** `docs/standing-constraints.md`'s Code section
    carries the guard; this entry just confirms it's not an oversight. Bounded
    at 2,000 matching rows per filter combination — chosen because past that
    depth numbered pagination stops being sensible UI, not because Postgres
    needs protecting from the row-skip.

## Obligations the contract cannot express — carry these into M2/M4

Each is something the type system genuinely cannot enforce, so it has to
live in a checklist rather than in a schema:

- **Every handler goes through `implement(contract)`** (the standing
  rule; see `docs/standing-constraints.md`). Mechanism: oRPC validates
  outputs at runtime and returns the _stripped_ object — verified in
  `@orpc/server@1.14.14` — but only when a schema is attached. A handler
  on the plain `os` builder with no `.output()` returns whatever the
  handler produced, and the `pick`-based leak protection evaporates.
  `apps/web/src/api/handlers-implement-contract.test.ts` is the test that
  makes this a build failure rather than a checklist item: it walks the
  router tree and asserts every served procedure's output schema is the
  contract's own schema instance, not merely present.
- **The session cookie is server-minted only**: ≥128 bits from a CSPRNG,
  HttpOnly + Secure + SameSite=Lax. Session _validation_ is get-or-reject:
  an unknown token is `{ ok: false }`, never a new session.
  `session.bootstrap` is the sole endpoint that mints — when validation
  rejects (stale cookie, first visit), it creates a fresh adopter + session.
  This is safe because tokens are 256-bit random (no client-supplied value
  to collide on), but it means bootstrap MUST sit behind per-IP rate
  limiting — without it, unauthenticated callers can create unbounded
  adopter rows.
- **Sign the cursor and bind it to the filters.** Payload carries a kind
  tag (`feed` / `reveal`) and `filtersFingerprint(filters)`; a mismatch is
  `INVALID_CURSOR`. The branded type is a convenience for honest callers
  and provides nothing at a trust boundary.
- **Clamp `swipes.record`'s `at`** to `[now - maxOfflineWindow, now]`.
- **Never construct a `PublicLocation` by hand** — `publicLocationOf`
  (for shelters, always `fuzzed_address` precision) and
  `animalPublicLocationOf` (for fostered animals, always `city`
  precision) are the only sanctioned paths. `PublicLocation` is a
  discriminated union on `precision`: `fuzzed_address` carries
  `FuzzedCoordinates`, `city` carries no coordinates at all. Both stay
  server-side: public responses, the reveal's included, carry the city
  only (`PublicCityLocationViewSchema`). The `LocationPrivacyPolicy.digest`
  must be an HMAC over a server-held key; `insecureUnkeyedDigest` is for
  tests and seed data.
- **Keep evidence documents out of the public image bucket.** Animal
  photo keys are public; `documentKey` on verification evidence is the
  same kind of value pointing at shelter registration paperwork.
- **Store `age_anchor_at`** (from `ageAnchorOf`) as the indexed column and
  filter with `ageAnchorRange`, rather than storing the age union.
- **Store `wait_anchor_at`** (from `waitAnchorOf`) as the indexed column,
  nullable, the same pattern as `age_anchor_at` above. Never sort "longest
  waiting" on `last_updated_at` (edit time, not availability time) or on
  `reserved.since` (reservation start, not original publish — `reserved`
  carries `publishedAt` forward precisely so the two don't collide). Two
  partial indexes, not one — `animals_wait_anchor_idx` (unfiltered) and
  `animals_wait_anchor_filtered_idx` (filtered) — see
  `docs/gallery-contract-decisions.md` §2 for why one index can't serve
  both cases.
- **`city_id` on animals** is the city the animal is discoverable in.
  For animals at their shelter it mirrors the shelter's city
  (denormalised); for fostered animals it is the foster city — a
  first-class property, not a projection. `Animal.publicLocation`
  (nullable) is `city`-precision when set (city + district, no
  coordinates); when null the animal is at the shelter and inherits the
  shelter's `fuzzed_address`-precision public location. Put equality
  columns before the ordering tuple in the feed index.

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
  normalize line endings _in the repo_ — the `eol=lf` attribute overrides
  `core.autocrlf` for every matched file (which is all of them) and forces
  LF in your working tree too, on Windows included. That's deliberate:
  it means every tracked file is LF on disk regardless of what
  `core.autocrlf` is set to, so there's nothing else to configure for
  files this repo already tracks. Modern editors (VS Code, WebStorm) save
  LF files as LF without complaint. `core.autocrlf` still matters for
  _new, untracked_ files you create before they're covered by a
  `.gitattributes` pattern — `git config --global core.autocrlf input` is
  the safer default on Windows (normalizes CRLF→LF on commit, doesn't
  force CRLF back on checkout), but don't expect it to change anything
  for files already in this repo.
- **corepack:** run `corepack enable` once (may need an elevated
  terminal the first time on Windows). After that, `pnpm` resolves to
  the exact version pinned in `package.json`'s `packageManager` field —
  don't install pnpm globally via npm. Node 24 (this project's pinned
  major — `.nvmrc` / `.node-version` select it for nvm, fnm and the like,
  matching `engines` and CI) still bundles Corepack; Node 25+ drops it from the default
  distribution, so a future Node upgrade will need `npm install -g
corepack` first. In CI, prefer `corepack enable && corepack install`
  (activates the pinned version explicitly) over a bare `corepack enable`
  followed by an implicit lazy download — the latter can hit Corepack's
  interactive download-confirmation prompt, which doesn't reliably
  suppress via `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` on every Corepack
  version. See `.github/workflows/ci.yml` for the pattern in practice.

## Module resolution (why `pnpm typecheck` is not enough)

The whole repo is on `module: ESNext` / `moduleResolution: Bundler`.
**Relative imports are extensionless** — `./freshness-display`, never
`./freshness-display.js`.

This is not cosmetic. `tsc` maps `./x.js` to `./x.ts` under *every*
resolution mode, so a `.js` extension typechecks perfectly clean and then
fails only in the bundler, which looks for a literal `x.js` on disk.
That is exactly how `/discovery` shipped to a green CI while being
unbuildable. Turbopack has no escape hatch here —
`experimental.extensionAlias` is on its explicitly-unsupported list.

`packages/*` were previously NodeNext, which mandates the extensions.
That bought nothing: all three are `noEmit`, are exported as
`./src/index.ts`, and have no raw-Node-ESM consumer (vitest uses Vite,
`db:seed` uses `tsx`, drizzle-kit bundles). Its only observable effect
was breaking the one bundler that does read those specifiers.

**`pnpm build:web` is therefore a required gate, in `check` and in CI.**
Typecheck structurally cannot catch this class of break. If you add a
frontend surface, it stays behind that gate.

One residual to know about: `module: ESNext` means TS no longer checks
Node's ESM↔CJS interop rules for `pnpm --filter @opika/db db:seed`, the repo's only real
Node-ESM entry point. No live exposure today (`postgres` resolves ESM,
`drizzle-orm` and `zod` are dual), but a CJS-only dependency added to
`packages/db` and named-imported would typecheck and fail at seed time.

## Commands

```bash
corepack enable          # once, machine-wide
pnpm i                   # install — resolves the pinned pnpm automatically
pnpm check                # typecheck -> lint -> test -> build:web -> test:harness, same as CI

# db:migrate, db:seed and onboard:shelter have no root alias — always run them with --filter.
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
pnpm build:web            # DO NOT REMOVE from check — see "Module resolution"
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
fresh install) before any milestone is considered done — that's the M0
definition of done, and it stays true going forward. Note that M0
reported this passing when it had never been run; "I believe it passes"
is not the same claim as "I ran it and here is the output."

### The two browser-layer gates

`build:web` and `test:harness` are the last two steps of `check` on
purpose, and neither is redundant:

- **`build:web`** catches what typecheck structurally cannot (see
  "Module resolution"). It fails in seconds with a compiler error.
- **`test:harness`** catches what a green build cannot: an app that
  compiles perfectly and lays out wrongly. It measures real geometry and
  drives real pointer events. (Until the brand lands, its geometry checks
  are frozen and new specs test flows only: see "Test logic, not looks".)
  **2026-10-20:** removed, not frozen. Oleksii, verbatim: "UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance." The
  harness now drives flows, keyboard operation and pointer events; the
  only size measurement left is V-B2's 48px min-height test on the shared
  primitives (`kabinet-profile-edit.harness.ts`). A few computed reads stay
  as presence checks, not measurements of looks: the V-B2 focus test's
  outline/box-shadow (an indicator is there), UI-U1's `boundingBox()`
  widths (a control exists at a width) and UI-U6's `naturalWidth` (a photo
  decoded). Its timing waits wait on a settled state or a stated event
  time, never the real clock (his condition for UI-U1..U7, 2026-10-20).

The harness builds the app too, which makes `build:web` look duplicated.
Keep both — `build:web` is the fast, specific failure, and it keeps
working if the harness is ever broken or quarantined.

(Frozen with the other visual checks, until the brand lands.) One assertion in the harness is
marked `test.fail()`: the deck
(`/tvaryny/gortaty`, migrated from `/discovery` in E5) is a 390px phone
column and does not adapt at 1280x800. That gap is recorded, not hidden.
When the responsive pass lands, Playwright will report an unexpected
pass — that is the signal to delete the marker.
**2026-10-20:** that marker is deleted, with the other UI-measuring tests (Oleksii, verbatim:
"UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance."). The deck's desktop gap is no longer asserted anywhere; the responsive pass is
tracked as design work, not as a failing test.

## Test logic, not looks (standing convention until the brand lands)

Oleksii, 2026-10-17 (inbox V-B1), verbatim: "Standing rule from now (until the designer's brand
lands): the visual design, fonts included, will change. Test logic, not looks.
- Stop: screenshot/pixel-diff checks, markup snapshots, assertions on CSS classes/colours/sizes/line-wrapping, mock-faithful styling work.
- Keep: domain, contract, handler and repository tests; Neon smokes; history checks; copy-gate; a few Playwright flow tests that query by role/label/text only; accessibility basics (labels, keyboard, aria-live).
- K2/K3/K4 screens: functional first, styled only through shared design tokens (colour, type, spacing) so the rebrand is a token swap. No one-off styles in components.
- Existing visual tests: don't extend them; remove any that start failing because of a visual change rather than fixing them."

His clarification (V-B2), verbatim: "both count as accessibility basics, not looks. - Visible
focus: keep one presence test (focused element shows an indicator when tabbing), never its
appearance. - 48px touch target: a shared min-height token on the shared button/control
primitives, plus ONE test on those primitives that the computed min-height is ≥ 48px. No
per-component or per-screen size checks."

In practice:
- **New tests assert behaviour:** states, flows, errors, what a control does. A Playwright test
  finds elements by role, label or text, never by class or position, and measures nothing.
- **New components use theme tokens only** (`apps/web/src/app/globals.css`, `@theme`): no
  arbitrary values (`text-[13px]`, `#hex`, `px-[7px]`) and no per-component font, colour or
  spacing. A rebrand edits the tokens, not the screens.
- **Accessibility basics stay tested:**
  - labels, keyboard operation and aria-live, per component, as behaviour;
  - focus visibility: one presence test;
  - the 48px floor: one test on the shared primitives.

  The constraints the brand itself must keep are in `docs/design/brand-constraints.md`.
- **Existing visual tests** (geometry, sizes, contrast, wrapping, `sizes` attributes, class
  assertions) are frozen, not extended. One that fails because of a visual change is **deleted,
  not fixed**, and the deletion is listed for Oleksii in the PR body.
- **A mock still decides structure and content** (which fields, which states, which copy), not
  pixels. So "when a mock exists, open the mock" (`docs/standing-constraints.md`) still holds for
  what a screen contains.
- **`test:harness` (above) still runs in `check`.** Its job narrows to flows and behaviour in a
  real browser. Its geometry assertions are the frozen visual tests just described.
- Rules in `docs/standing-constraints.md` that this narrows carry a pointer back here.

**2026-10-20: the visual tests are removed, not frozen.** Oleksii, 2026-10-20, verbatim: "UI-measuring tests: yes, keep both V-B2 tests (the 48px shared controls and the focus indicator being present). They’re accessibility guarantees, not looks. Drop the rest that measure appearance."
So every harness and unit test that measured appearance (geometry, sizes, margins, overflow,
contrast, wrapping and truncation, `sizes`/srcset, CSS class and colour assertions, focus-ring
width) is deleted, and the `test.fail()` desktop-deck marker with it. Two V-B2 tests stay, both in
`kabinet-profile-edit.harness.ts`: the shared controls' computed min-height ≥ 48px, and a focused
control showing an indicator when tabbing. Where a deleted check also walked the tab order, the
walk stays as keyboard reachability (`expectReachableByTab`). The list of what went and what was
kept as unsure is `docs/decisions-inbox/chore-drop-ui-measuring-tests.md`. The bullets above that
say "frozen" describe the state before that date.

## Supply-chain note (why a version pin looks slightly stale)

pnpm 11's `minimumReleaseAge` defaults to 1440 minutes (24h) — a newly
published package version won't resolve until it's a day old. This is
deliberate and should stay on; it would have blocked the 2025 npm
Shai-Hulud worm incidents entirely. If `pnpm-workspace.yaml`'s catalog
pins a version one patch behind npm's absolute latest, that's usually
why — it's the newest version that's already cleared quarantine. Don't
"fix" this by bumping to `latest` and adding a `minimumReleaseAgeExclude`
entry; wait a day, or pick the next-newest cleared version instead.
@docs/model-policy.md

# Working loop

Append this section to CLAUDE.md. It is what makes the reviewer fire without being asked, and
what lets work continue without Oleksii gating every step.

## Who does what (2026-10-23; supersedes the 2026-10-21 cloud/local split below, and the rules
further below where they conflict)

Cloud sessions ran from 2026-10-21 to 2026-10-23 (3–4 parallel builders, cloud Tier 1 reviewers).
Oleksii ended that, verbatim (2026-10-23): "From now on, everything runs locally; no cloud
sessions until I say otherwise. Keep local use lean." The mechanics he gave the same day,
verbatim: "Local agents only. At most two at once. Builder and reviewer are always separate
agents. A Tier 1 review is always a fresh agent pinned to the exact SHA. You do non-Tier-1
reviews, delta checks, rebases, and merges at the reviewed head on green CI. You're the only one
who merges. Only blockers loop. Notes go into one follow-up batch per area."

What each role may do:

- **The local agent** (this session, on Oleksii's machine) builds: implements the row,
  runs `pnpm check`, commits with the green run pasted in the body, pushes.
  - Opens each PR as a draft, with the verified-vs-asserted ledger in the body.
  - Reviews everything except Tier 1 itself, kept lean: the diff, the suites it touches, a few
    mutations, CI's `pnpm check`.
  - Merges at the reviewed head — its own review for non-Tier-1, a fresh local reviewer's for
    Tier 1 — on green CI. **It is the only one that merges.**
  - Writes a smoke sitting (`Claude outputs/SMOKE-sitting-<date>.txt`: one fresh child branch,
    `nvm use 24` first, every command in its `--filter` form, expected counts) for anything
    needing his real-Neon check, and does not merge that PR until he's run it.
  - Never runs a production action, writes a secret, or force-pushes `main`.
- **A Tier 1 reviewer** is a fresh local agent, never the one that built the change (a review run
  inside the building session doesn't count).
  - Read-only: it never edits code, pushes the PR branch, or merges, approves or closes a PR.
  - Its verdict names the exact head SHA on its first line; a verdict for any other SHA doesn't
    count.
  - It pushes only the review file, `docs/reviews/<branch>/<short-sha>.md`, on its own
    `reviews/pr-<n>-<short-sha>` branch — the same mechanism the cloud reviewers used, just run
    locally now.
- **Oleksii:** runs the real-Neon smokes in batched sittings, the production migrations, takes
  the decisions and writes the copy, runs every other production action (env, DNS, deletions).

The rules (carried over from the cloud era, unchanged by the switch to local-only):

- **Only blockers loop.**
  - A STOP is fixed and re-reviewed, as a delta.
  - A PASS WITH NOTES merges at the reviewed head on green CI. Where SQL or auth is involved, it
    waits for his smoke first. A PR with a migration also waits for his production migration.
  - The notes go into one follow-up batch per area, fixed and reviewed together later.
  - A Tier 1 note that touches a live security path counts as a blocker; tests-only and docs notes
    don't. A reviewer marks such a note `[Blocker]`.
- **Open PRs never share a file.** His rule, verbatim (2026-10-20): "Replace the hard "two PRs"
  limit with a rule: any number of PRs may be open as long as no two share a file. A PR that
  shares a file with an open one waits."
- **The rebase rule:** the verdict carries over when there is no conflict, `git range-diff` shows
  every patch `=`, and the PR's files don't overlap main's new commits. Green CI on the rebased
  head is then the gate. Anything else gets a short delta review. His wording is quoted in full
  under "Merge only the commit that was reviewed". A rebase with real conflicts (not just `=`
  patches over a clean range-diff) is never a bare "take one side" per hunk — a hunk can look like
  one branch's change when it's really unchanged context from a third branch that already landed;
  verify each resolved hunk against both sides' own diffs against their common ancestor, not just
  against the conflict markers.
- **Smokes** are batched: one sitting, one fresh child branch, the commands in order, once or
  twice a day, in `Claude outputs/SMOKE-sitting-<date>.txt`.

Dropped with the cloud sessions (2026-10-23): the cloud builder role; the "3–4 sessions in
parallel" scale; the launch-file ritual (`Claude outputs/LAUNCH-batch-<date>.txt`, Oleksii
starting each session by hand) — nothing starts a session for him to paste anymore; and the
launch-prompt network-naming rule, which existed only because a cloud prompt could end up quoted
in a commit or PR of this public repository.

Revised 2026-10-04 per `docs/handoff-2026-10-04.md` §4: review and decisions now run in
parallel with building rather than ahead of it. The quality bar, the standing constraints and
the Tier 1 gates are unchanged — what changed is *where* review happens and *what blocks the
builder*. See the 2026-10-04 amendment below for the mechanism. Who reviews and who merges was
revised on 2026-10-21 and again on 2026-10-23 ("Who does what", above).

## The loop

Work proceeds in iterations. One iteration is one plan item — a D-row, a DECK-row, a fix, a
sweep. For each iteration:

1. Do the work.
2. Run `pnpm check`.
3. Commit (green `pnpm check`, output pasted in the commit body) and push the branch. A branch
   commit ships nothing to anyone. Classify the row's tier (see Process tiers): it decides who
   reviews the pushed head ("Who does what", above):
   - **Tier 1:** a fresh local agent, pinned to the exact SHA, never the one that built it.
     Nothing merges before that review has passed. (Until 2026-10-21 it ran synchronously before
     the commit, through a local `opika-reviewer` subagent; 2026-10-21 to 2026-10-23 it ran in a
     cloud session; see "Who does what".)
   - **Everything else:** one review by the local agent, kept lean. A change the
     local agent wrote itself goes to a fresh local reviewer instead, for the same
     independence reason.
4. Act on the verdict:
   - **PASS:** the local agent merges it at that head on green CI.
   - **PASS WITH NOTES:** it merges the same way, after Oleksii's smoke where SQL or auth is
     involved. Its notes go into one follow-up batch per area, fixed and reviewed together later.
     The exception is a Tier 1 note that touches a live security path: it is a blocker, and is
     handled like a STOP.
   - **STOP:** do not continue past it and do not work around it. **Commit first, then push,
     then write to Oleksii:** what the decision is, the options with their consequences, and what
     you recommend. Then wait; the amendment below says why the commit comes first. The fix is
     reviewed again as a delta, and only blockers loop.
5. Builders never open PRs. The local agent opens each PR as a draft, with the
   verified-vs-asserted ledger in the body. It merges at the reviewed head, except the kinds that
   wait for Oleksii: a migration PR waits for his production migration, a Tier 1 PR waits until its
   full review has passed, and SQL or auth work waits for his smoke. See "Merge only the commit
   that was reviewed" under Agent rules.

Never spawn a review on work you have not finished, and never continue past a STOP by
reinterpreting it as a note.

### Amendment, 2026-09-06 — a STOP blocks a merge, not a commit

A reviewer STOP blocks a **merge**, not a **commit**. When the reviewer returns STOP: commit
the work on the branch first, push it, then surface the decision to Oleksii. Uncommitted work
is a risk (a branch commit is not — it ships nothing to anyone and is fully reversible); never
hold a green working tree uncommitted while waiting for an answer.

Corollary: STOP-list items about documentation, attribution and provenance are **PR-blocking**,
not commit-blocking. Only items that would reach users or destroy data block a commit —
production writes, deletions, and secrets. (*Since 2026-10-21* the review runs on the pushed head,
after the commit. So these three are the builder's own never-list in "Who does what": a secret, a
production write or a deletion is never committed at all. A reviewer's STOP on one still blocks
the merge, and the builder removes it.) If the open PR is still a draft, keep it in draft
until the STOP resolves; if it's already open for review, say in the same message that a STOP
finding is unresolved rather than merging over it.

### Amendment, 2026-09-06 — review cadence

Between review passes on the same row, run only the test suites the fix actually touches, not
the full `pnpm check`. Run a full `pnpm check` **once**, immediately before the commit — that
is the one run whose green matters for the commit message and the PR body. Re-running the
whole suite after every small fix is the same waste `test:harness` already warns against
running twice concurrently: it slows the loop without changing what gets asserted.

Tier 3 changes (see "Process tiers" below) get no reviewer pass at all — they are covered
once, in the batch, at the PR-level pass. (*Since 2026-10-21* everything outside Tier 1, Tier 3
included, gets one review: by the local agent, or by a fresh local reviewer when the local agent
wrote it. See "Who does what".)

### Amendment, 2026-10-04 — review runs beside building (superseded in part, 2026-10-21)

(`docs/handoff-2026-10-04.md` §4.1–§4.3, an owner-stated process change, not a quality
change — see "Process latency is a stated owner cost" in `docs/standing-constraints.md`.)

What still holds:
- **Review files are git-tracked:** every verdict is written to
  `docs/reviews/<branch>/<short-sha>.md` (Tier 3 to commit). A Tier 1 reviewer pushes it on its
  own `reviews/*` branch; the local agent commits the files of its own reviews the same way.
- **The full `pnpm check` is the builder's evidence.** A reviewer reads the commit's pasted green
  run, runs only the suites the diff touches, plus its own mutations. Mutation testing of a new
  guard, floor or assertion is **the builder's job**, recorded in the commit message as
  `mutation: <what was broken> → <failure text>`. The reviewer spot-checks at least one
  mutation per row and verifies the rest were done rather than redoing them.
- **A STOP blocks the PR, never the commit** (the 2026-09-06 amendment above stands for every
  tier).
- **Tier 1's Phase 0 questions go to Oleksii before code**, batched at the PR's start (WM-B1).

What 2026-10-21 replaced ("Who does what", above):
- the background `opika-reviewer` subagent in the builder's own session, and the three points at
  which the builder read its pending review files;
- the limit of two rows in flight, and the pause when the reviewer fell three rows behind;
- "fixes for a review finding are their own small commit, re-reviewed the same way". Now only a
  blocker's fix is re-reviewed; other notes wait for their area's follow-up batch.

Builds ran in parallel cloud sessions under the file-overlap rule from 2026-10-21 to 2026-10-23;
local-only since (see "Who does what"). Each review is done by a fresh local reviewer for Tier 1,
or by the local agent for everything else.

### Amendment, 2026-10-17 — working mode (supersedes the rules above and below where they conflict, except "Who does what", 2026-10-21 and 2026-10-23, which supersedes it)

Oleksii, 2026-10-17 (inbox WM-B1), verbatim:

"New working mode, to ship faster without losing security:
1. Tiered process.
   - Tier 1 = auth/access, data deletion, prod writes, secrets, R2, anything a public page or email claims. Keep the current process: review before commit, real-Neon when SQL changes, my explicit decisions, full inbox records.
   - Everything else: one review. A second only if the first finds a blocker. No review-of-the-fix loops.
2. Decisions.
   - Decide reversible things yourself and list them under "Decisions taken" in the PR description; I can overturn them at merge.
   - Ask me only for irreversible, security, public-claim or brand-voice questions. One batch per PR, at its start, with a recommendation each.
3. Copy gate scope.
   - Allow [COPY PENDING] strings on kabinet screens reachable only by the allowlisted test shelter. Keep the strict gate for public pages, emails, sign-in and anything a real shelter can reach.
   - PR 6 (opening writes to everyone) must refuse while any pending string remains.
   - This is a Tier 1 change: propose the exact mechanism and test before building.
4. Records. Non-Tier-1: one line per decision in the inbox. Tier 1: as now.
5. Parallelism. At most two open feature PRs at a time, touching different areas, to avoid #99-style conflicts.
Unchanged: prod guards, --expect, no secrets in chat, no R2 deletes, real-Neon for SQL, copy truth on public surfaces, I merge everything."

What that changes, concretely:
- **Two tiers, not three.**
  - **Tier 1:** auth and access, data deletion, production writes, secrets, R2, and anything a
    public page or an email claims. The full process stays: a full review before merge, real-Neon
    when SQL changes, his explicit decisions asked up front, full inbox records. (*Since
    2026-10-21* the review runs in a fresh reviewer session on the pushed head, before merge —
    cloud through 2026-10-23, a fresh local agent since. It used to run before the commit, in a
    worktree; see "Who does what".)
  - **Everything else** (the old Tiers 2 and 3) gets **one** review, by the local agent since
    2026-10-21. A second review happens only when the first finds a blocker. No review-of-the-fix
    loops: non-blocking notes go into one follow-up batch per area, fixed and reviewed together
    later.
- **Reversible decisions are taken, not asked.** Anything the builder can undo later (layout,
  naming, test shape, an ambiguous design point with no mock) is decided and listed under
  **"Decisions taken"** in the PR description, where he can overturn it at merge (or afterwards, as
  a follow-up, when the PR merged under "Merge only the commit that was reviewed"), and recorded
  as one inbox line. These are the builder's decisions and are recorded as such, never as his
  approval (standing constraints: only his own words are approval).
- **He is asked only** about irreversible, security, public-claim or brand-voice questions
  (Ukrainian copy is brand voice). One batch per PR, at its start, each with a recommendation.
- **Copy gate scope** (item 3): his mechanism (CG-Q1/CG-B1, built in PR 2 of the K milestone)
  let `[COPY PENDING]` sit under `kabinet.testShelterOnly.*`, readable only by the allowlisted test
  shelter. PR 6 deleted the allowlist and that namespace with it (his 0.3a), so the exemption has
  ended: no `[COPY PENDING]` anywhere under `kabinet.*`, in CI (`copy-status.test.ts`,
  `open-writes-copy-gate.test.ts`) and at run time (any pending string keeps production sign-in off).
- **Parallel PRs, replaced 2026-10-20:** his words, verbatim: "Replace the hard “two PRs” limit with a rule: any number of PRs may be open as long as no two share a file. A PR that shares a file with an open one waits." (The two-PR text in his WM-B1 quote above is kept as he wrote it.)
- **Unchanged:** production guards, `--expect`, no secrets in chat, no R2 deletes, real-Neon
  for SQL, copy truth on public surfaces. **"No R2 deletes" gained its one named exception,
  2026-10-25:** the GDPR photo-retention job (`r2-cleanup-client.ts`, `docs/gdpr-analysis.md`)
  deletes an R2 object only after it has sat unreferenced for the grace period, and is the one
  code path allowed `DeleteObjectsCommand`/`ListObjectsV2Command` — enforced structurally by
  `photo-pipeline-scan.test.ts`, which still fails any *other* file that imports either. "I merge
  everything" was narrowed twice:
  - *2026-10-19:* he allows merging a green PR whose exact head was reviewed, with two exceptions
    that wait for him (see "Merge only the commit that was reviewed" under Agent rules).
  - *2026-10-21:* the local agent merges, and it is the only one that does ("Who does what").

  His WM-B1 words above stay as he wrote them, including item 5's two-PR limit, which his
  2026-10-20 file rule replaced.

## Decisions stop blocking

(`docs/handoff-2026-10-04.md` §4.4.) `docs/decisions-inbox.md` — one table, on `main` only,
append-only, columns `ID | Date | Row | Question | Options | Default taken | Oleksii's answer
| Status` — replaces `docs/decisions-pending-review.md`'s 752-line narrative of per-branch
copies for new decisions.

- A **Tier 2 decision never blocks the builder.** Take the recommended default, write the
  inbox row, continue. (Since 2026-10-17: any reversible decision, recorded as one inbox line and
  listed under "Decisions taken" in the PR; see the working-mode amendment.) Oleksii answers in bulk when he reviews the PR; an override becomes a
  small follow-up commit. **This does not touch the STOP list below** ("Stop and ask,
  regardless of what the reviewer said") — an ambiguous design with no mock, a new or changed
  user-facing claim, and the rest of that list are never "a Tier 2 decision" no matter which
  tier the surrounding code change is, and still stop and wait rather than taking a default.
  The inbox is for the other kind: a reversible implementation judgement call that used to be
  a "decisions needing your eye, not blocking" entry in `docs/decisions-pending-review.md`.
- A **Tier 1 decision still blocks the merge** — but not the rest of the branch. Write the
  row, commit the work, move to the next row that doesn't depend on it. Oleksii answers the
  batch, not one question at a time.
- **Ukrainian copy never blocks code.** New strings ship as `[COPY PENDING]`, pinned by
  `copy-status.test.ts`, with the English sense and key name recorded in the inbox. The only
  copy that *does* block a merge is a `/prytulkam` commitment sentence (the register in
  `docs/standing-constraints.md`), because a false sentence must never be live.
- Branches write new rows to `docs/decisions-inbox/<branch>.md`; the PR merge appends them to
  the main table — no more hand-reconciled per-branch copies of a 750-line file.
- `docs/decisions-pending-review.md` is superseded and kept as read-only history as of
  2026-10-04 — don't add to it, don't migrate its already-resolved entries.

## Agent rules (every agent, every session)

- **Never generate artificial CPU or memory load.** No busy-loops, stress tools or piles of
  parallel processes to "reproduce under load". On 2026-10-19 an agent ran 30 busy-loops on 24
  cores and very likely crashed the PC. Reproduce timing bugs by deterministic forcing only: fake
  clocks, an injected delay, a `MutationObserver` hook, a forced scheduling order. Oleksii,
  2026-10-19, verbatim: "the no-artificial-load rule is right, keep it permanent (write it into
  CLAUDE.md's agent rules)."
- **Merge only the commit that was reviewed.** The permission, Oleksii, 2026-10-19, verbatim:
  "Auto-merge is allowed, including #137, #136 and #139, once each is green and has had its one
  review. Two exceptions wait for me: A PR with a migration. I run the production migration from
  the PR branch first, then merge. If it merges before that, production deploys code against the
  old schema. A Tier 1 PR (auth/access, deletion, prod writes, secrets, R2, public claims) until
  its full review has passed. Once it has, auto-merge is fine. Every PR states its migration kind
  (“none” / “additive” / “destructive”) so it’s clear which ones wait." Its limit, verbatim, the
  same day: "enable auto-merge only after the final push. The merge has to apply to the exact
  commit that was reviewed: if new commits arrive, the review is stale and auto-merge turns off
  until the delta is reviewed."

  How it's applied:
  - **Who merges:** the local agent, and only the local agent (2026-10-21, "Who does what"). A
    PASS WITH NOTES merges like a PASS. Where SQL or auth is involved, it waits for Oleksii's
    real-Neon smoke on the reviewed head.
  - A merge watcher takes the reviewed head SHA and merges with `gh pr merge --squash
    --match-head-commit <sha>`, so GitHub refuses if the head moved.
  - It never runs `update-branch` itself, which would create an unreviewed head.
  - Any new commit (a fix, his own copy, a merge commit carrying a conflict resolution) gets its
    delta reviewed before the merge.
  - A rebase is new commits too; the ruleset requires a PR to be up to date before it merges, so
    a PR that waits while the default branch moves gets one. His rule for it, verbatim
    (2026-10-19, replacing his earlier docs-only version): "Keep "require branches to be up to
    date" on. A rebase needs no delta review only when all three hold: no conflicts; git
    range-diff shows every patch unchanged; the PR's changed files don't overlap the files changed
    by the new commits on main. Then green CI on the rebased head is the gate. Paste the
    range-diff summary and the overlap check in the PR. Anything else (a conflict, a patch
    difference, an overlapping file) gets a short delta review, Tier 1 included."
  - The two exceptions in his words above: a PR with a migration waits for his production
    migration from the PR branch; a Tier 1 PR waits until its full review has passed, then
    merges like any other.
- **Full `pnpm check` runs are serialised:** at most two at once on the machine. In this session's
  scratchpad that's `check-slot.sh`; any equivalent lock will do. Targeted suites are free.

## What continues automatically, and what does not

Continue without asking:

- the next row in the current phase's plan
- fixes for a blocker: a STOP, or a Tier 1 note on a live security path. Since 2026-10-21 other
  review notes wait for their area's follow-up batch.
- sweeps the reviewer identified as the same defect class (into that batch, unless a blocker)
- anything already decided in this conversation or recorded in `docs/`

Stop and ask, regardless of what the reviewer said (narrowed 2026-10-17: ask only for
irreversible, security, public-claim or brand-voice questions, batched at a PR's start; an
ambiguous design point with no mock, or a reversible schema choice, is now decided and listed
under "Decisions taken"; see the working-mode amendment):

- the reviewer's STOP list (production, deletion, Ukrainian copy, user-facing claims, secrets,
  asset licensing, ambiguous design with no mock, widening a schema for a temporary mode)
- a collision between an instruction and the code that cannot be resolved without choosing
- a plan item whose acceptance criterion turns out not to be measurable as written
- anything that would take more than one phase to do properly

When you stop, stop with work in hand: do the preparatory part that is unambiguous, then
present the decision. Do not sit idle waiting.

## Reporting

Between iterations, keep it short — what shipped, what the reviewer found, what is next. The
long form belongs in the PR body, not in chat.

When you stop for a decision, the message has four parts and nothing else: the decision, the
options, the consequence of each, your recommendation. No recap of what you built.

Session reports to Oleksii: what shipped, what's in the inbox, what's next — under ten lines.
Everything else is in the PR.

## Documentation diet

(`docs/handoff-2026-10-04.md` §4.5.) The build-plan is this project's longest artefact and a
real tax on every session's context. Standing rule from 2026-10-04:

- A **build-plan row is at most five lines**: status, PR, one sentence of what shipped, what's
  verified vs asserted, follow-ups by ID. The narrative — review rounds, measurements, what
  was mutated — lives in the **PR body** and in `docs/reviews/`. Existing long rows are left
  alone (don't spend a session rewriting history); new rows follow the rule.
- The `pnpm check` wall-time paragraph and Part 3's hour-arithmetic paragraphs in
  `docs/build-plan.md` are frozen — no more updates; `docs/handoff-2026-10-04.md` §3's ledger
  is the plan of record for ordering from here.

## Standing constraints that outrank convenience

These live in `docs/standing-constraints.md` and are repeated here because the loop is where
they get skipped:

- Time is not a decision input. No deadline unless Oleksii states one. Where options differ,
  the better product wins. "Faster" never appears in a decision record.
- A claim verified against shape is not verified. Run it.
- The mutation for a floor is crossing it, not perturbing the measurement.
- A documented limit with no test exercising it is not a limit. (For visual limits, until the
  brand lands: see "Test logic, not looks".)
- An assertion inside a conditional is not an assertion.
- A test may not compare output against the same constant the code renders.
- Where a mock exists, open the mock. Where none exists, the prose is the specification.
  (For structure and content; not pixels, until the brand lands.)
- Anything demo mode suppresses needs harness coverage of its non-demo state.
- Local Postgres and Neon are not the same database. A driver-, connection-, or dialect-touching
  change needs a check against real Neon before it's called verified — a green local suite
  alone doesn't cover it.

## Process tiers

Not every change earns the same scrutiny. Classify before starting; say which tier and why.

**Superseded in part, 2026-10-17** (the working-mode amendment under "The loop"): Tier 1 is now
auth/access, data deletion, production writes, secrets, R2, and anything a public page or email
claims. Tiers 2 and 3 below merge into "everything else: one review". Read the definitions below
with that override. **And since 2026-10-21** ("Who does what", top of "Working loop"), the
reviewer is a fresh reviewer session for Tier 1 (cloud through 2026-10-23, a fresh local agent
since) and the local agent for everything else; a PASS WITH NOTES merges and its notes are
batched. Where Tier 2 below says to spawn `opika-reviewer` in the background, read that as the
local agent's one review.

TIER 1 — full gate. Phase 0 questions answered and sent to Oleksii before code. Reviewer
required. Mutation required. Applies to: production data, seed/truncate/migration paths,
secrets and security, user-facing claims and the /prytulkam commitments, Ukrainian copy,
asset licensing, anything a real shelter's data flows through.

**Deleting existing copy that a shipped change made false is not gated the same way** —
`docs/standing-constraints.md`'s "Removing a false claim is not the same gate as adding one":
a deletion needs no Phase 0 round trip, since it can only narrow what a page asserts, never
introduce a new claim. Writing whatever fuller, honest replacement comes later still goes
through the full Tier 1 gate like any other new copy — the deletion and its eventual
replacement are two separate actions on two separate tiers, not one held hostage to the other.

TIER 2 — reviewer only. No gate to Oleksii, no round trip. Do the work, pnpm check, commit,
spawn opika-reviewer in the background against the commit (see the 2026-10-04 amendment to
"The loop"), and continue to the next row without waiting on it. Applies to: app code, layout,
tests, harness work, refactors.

TIER 3 — light. pnpm check and commit. Reviewer runs once at PR level over the batch, not per
commit (since 2026-10-21, that review is the local agent's, or a fresh local reviewer's when the
local agent wrote it). Applies to: renames with no behaviour change, doc edits, comments, formatting,
config with no runtime effect.

When a tier is ambiguous, pick the higher one and say so in one line. When a Tier 3 change
turns out to touch behaviour, stop and re-tier rather than continuing at the lower bar.

Do not bundle tiers. A Tier 1 item riding inside a Tier 3 commit erases the distinction.
