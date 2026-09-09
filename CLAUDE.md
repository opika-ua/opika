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
| Hosting          | Vercel Pro at MVP, spend cap on day one, images off-platform. Exit ramp: OpenNext → Cloudflare Workers (validate once, don't take yet)                                                                                   |
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
10. **Feed ordering: keyset on `(lastUpdatedAt DESC, id)`**, with
    `scoreAnimal` re-ranking within the fetched page. No materialised score
    column, so no recompute job as freshness decays and no backfill when the
    weights are tuned. The accepted cost: de-ranking stale listings is a
    within-page effect, not a global ordering. **M2 implements this.**
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
    30 reveals per 24h, counted from the existing `reveals` table — no new table
    needed, survives cold starts.
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
  `FuzzedCoordinates`, `city` carries no coordinates at all — the city
  centroid is available via `CityView.centroid` and is honestly labelled
  as such. The `LocationPrivacyPolicy.digest` must be an HMAC over a
  server-held key; `insecureUnkeyedDigest` is for tests and seed data.
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
  major) still bundles Corepack; Node 25+ drops it from the default
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
Node's ESM↔CJS interop rules for `pnpm db:seed`, the repo's only real
Node-ESM entry point. No live exposure today (`postgres` resolves ESM,
`drizzle-orm` and `zod` are dual), but a CJS-only dependency added to
`packages/db` and named-imported would typecheck and fail at seed time.

## Commands

```bash
corepack enable          # once, machine-wide
pnpm i                   # install — resolves the pinned pnpm automatically
pnpm check                # typecheck -> lint -> test -> build:web -> test:harness, same as CI
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
  drives real pointer events.

The harness builds the app too, which makes `build:web` look duplicated.
Keep both — `build:web` is the fast, specific failure, and it keeps
working if the harness is ever broken or quarantined.

One assertion in the harness is marked `test.fail()`: the deck
(`/tvaryny/gortaty`, migrated from `/discovery` in E5) is a 390px phone
column and does not adapt at 1280x800. That gap is recorded, not hidden.
When the responsive pass lands, Playwright will report an unexpected
pass — that is the signal to delete the marker.

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

## The loop

Work proceeds in iterations. One iteration is one plan item — a D-row, a DECK-row, a fix, a
sweep. For each iteration:

1. Do the work.
2. Run `pnpm check`.
3. **Invoke the `opika-reviewer` subagent** with the diff, the plan item it was meant to
   satisfy, and every claim being made about it. This is not optional and not conditional on
   the change looking small.
4. Act on the verdict:
   - **PASS** — commit, then start the next plan item without asking.
   - **PASS WITH NOTES** — address the notes, re-invoke the reviewer on the fix, then commit
     and continue.
   - **STOP** — do not continue past it and do not work around it, but **do commit first,
     then push, then write to Oleksii**: what the decision is, the options with their
     consequences, and what you recommend. Then wait. See the amendment below for why commit
     precedes the wait rather than following it.
5. When a phase's rows are all committed, open the PR with the verified-vs-asserted ledger in
   the body, and tell Oleksii it is ready. Do not merge.

Never invoke the reviewer on work you have not finished, and never continue past a STOP by
reinterpreting it as a note.

### Amendment, 2026-09-06 — a STOP blocks a merge, not a commit

A reviewer STOP blocks a **merge**, not a **commit**. When the reviewer returns STOP: commit
the work on the branch first, push it, then surface the decision to Oleksii. Uncommitted work
is a risk (a branch commit is not — it ships nothing to anyone and is fully reversible); never
hold a green working tree uncommitted while waiting for an answer.

Corollary: STOP-list items about documentation, attribution and provenance are **PR-blocking**,
not commit-blocking. Only items that would reach users or destroy data block a commit —
production writes, deletions, and secrets. If the open PR is still a draft, keep it in draft
until the STOP resolves; if it's already open for review, say in the same message that a STOP
finding is unresolved rather than merging over it.

### Amendment, 2026-09-06 — review cadence

Between review passes on the same row, run only the test suites the fix actually touches, not
the full `pnpm check`. Run a full `pnpm check` **once**, immediately before the commit — that
is the one run whose green matters for the commit message and the PR body. Re-running the
whole suite after every small fix is the same waste `test:harness` already warns against
running twice concurrently: it slows the loop without changing what gets asserted.

Tier 3 changes (see "Process tiers" below) get no reviewer pass at all — they are covered
once, in the batch, at the PR-level pass.

## What continues automatically, and what does not

Continue without asking:

- the next row in the current phase's plan
- fixes the reviewer asked for
- sweeps the reviewer identified as the same defect class
- anything already decided in this conversation or recorded in `docs/`

Stop and ask, regardless of what the reviewer said:

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

## Standing constraints that outrank convenience

These live in `docs/standing-constraints.md` and are repeated here because the loop is where
they get skipped:

- Time is not a decision input. No deadline unless Oleksii states one. Where options differ,
  the better product wins. "Faster" never appears in a decision record.
- A claim verified against shape is not verified. Run it.
- The mutation for a floor is crossing it, not perturbing the measurement.
- A documented limit with no test exercising it is not a limit.
- An assertion inside a conditional is not an assertion.
- A test may not compare output against the same constant the code renders.
- Where a mock exists, open the mock. Where none exists, the prose is the specification.
- Anything demo mode suppresses needs harness coverage of its non-demo state.

## Process tiers

Not every change earns the same scrutiny. Classify before starting; say which tier and why.

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

TIER 2 — reviewer only. No gate to Oleksii, no round trip. Do the work, pnpm check, invoke
opika-reviewer, act on the verdict, commit, continue. Applies to: app code, layout, tests,
harness work, refactors.

TIER 3 — light. pnpm check and commit. Reviewer runs once at PR level over the batch, not per
commit. Applies to: renames with no behaviour change, doc edits, comments, formatting,
config with no runtime effect.

When a tier is ambiguous, pick the higher one and say so in one line. When a Tier 3 change
turns out to touch behaviour, stop and re-tier rather than continuing at the lower bar.

Do not bundle tiers. A Tier 1 item riding inside a Tier 3 commit erases the distinction.
