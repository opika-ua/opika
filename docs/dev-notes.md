# Windows, line endings and module resolution

Moved verbatim from CLAUDE.md in DS PR 5 (setup notes, read when setting up or when a build fails on an import path).

## Windows development notes

You're developing on Windows. Two things matter here:

- **Line endings:** `.gitattributes`' `* text=auto eol=lf` doesn't just
  normalize line endings _in the repo_ - the `eol=lf` attribute overrides
  `core.autocrlf` for every matched file (which is all of them) and forces
  LF in your working tree too, on Windows included. That's deliberate:
  it means every tracked file is LF on disk regardless of what
  `core.autocrlf` is set to, so there's nothing else to configure for
  files this repo already tracks. Modern editors (VS Code, WebStorm) save
  LF files as LF without complaint. `core.autocrlf` still matters for
  _new, untracked_ files you create before they're covered by a
  `.gitattributes` pattern - `git config --global core.autocrlf input` is
  the safer default on Windows (normalizes CRLF→LF on commit, doesn't
  force CRLF back on checkout), but don't expect it to change anything
  for files already in this repo.
- **corepack:** run `corepack enable` once (may need an elevated
  terminal the first time on Windows). After that, `pnpm` resolves to
  the exact version pinned in `package.json`'s `packageManager` field -
  don't install pnpm globally via npm. Node 24 (this project's pinned
  major - `.nvmrc` / `.node-version` select it for nvm, fnm and the like,
  matching `engines` and CI) still bundles Corepack; Node 25+ drops it from the default
  distribution, so a future Node upgrade will need `npm install -g
corepack` first. In CI, prefer `corepack enable && corepack install`
  (activates the pinned version explicitly) over a bare `corepack enable`
  followed by an implicit lazy download - the latter can hit Corepack's
  interactive download-confirmation prompt, which doesn't reliably
  suppress via `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` on every Corepack
  version. See `.github/workflows/ci.yml` for the pattern in practice.

## Module resolution (why `pnpm typecheck` is not enough)

The whole repo is on `module: ESNext` / `moduleResolution: Bundler`.
**Relative imports are extensionless** - `./freshness-display`, never
`./freshness-display.js`.

This is not cosmetic. `tsc` maps `./x.js` to `./x.ts` under *every*
resolution mode, so a `.js` extension typechecks perfectly clean and then
fails only in the bundler, which looks for a literal `x.js` on disk.
That is exactly how `/discovery` shipped to a green CI while being
unbuildable. Turbopack has no escape hatch here -
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


# Condensed out of CLAUDE.md (DS PR 5 round 2)

Moved verbatim to keep CLAUDE.md short; CLAUDE.md holds a one-to-four line version of each.

## M0 definition of done


`pnpm i && pnpm check` must pass on a clean clone (no `node_modules`,
fresh install) before any milestone is considered done - that's the M0
definition of done, and it stays true going forward. Note that M0
reported this passing when it had never been run; "I believe it passes"
is not the same claim as "I ran it and here is the output."

## Test databases

# Each checkout's test databases (opika_test_<hash>, opika_harness_<hash>) are dropped
# when its vitest/harness run ends; KEEP_TEST_DB_ON_FAILURE=1 keeps a failed run's.
# Also kept: after a Ctrl-C'd vitest run (its teardown never runs), after a harness run
# given a CLI --reporter (it replaces the dropping reporter), and while another session
# still uses it (the drop is never forced). The next run reuses it; the prune clears it.

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


## Phase scope discipline

This repo is built phase-by-phase against `docs/build-plan.md`, whose
Part 1 has the current status of everything through M5 and whose Part 2
is the live phase list. **Do not scaffold ahead of the current phase** -
e.g. do not add a package or a schema table before a phase explicitly
calls for it, even if it would be convenient to stub out. Premature
scaffolding is exactly the kind of thing that turns into stale,
half-wired code in a solo 10h/week project.

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


## Test-DB drops: the ProcSignalBarrier pile-up (2026-10-30)

Symptom: with several agents running DB tests at once, `DROP DATABASE` statements sat on
`wait_event = ProcSignalBarrier` in the `postgres` maintenance DB (50+ stuck sessions), the local
server saturated, and `pnpm db:prune-test-dbs --yes` exited 13 (an unsettled top-level await)
after listing. It was not open connections: `WITH (FORCE)` did not help and `lock_timeout` does
not cover the barrier wait.

What the code does now (`packages/db/src/test-utils/test-database.ts`):
- CREATE / COMMENT / DROP DATABASE all run under one session advisory lock
  (`TEST_DB_MAINTENANCE_LOCK_KEY`) on the maintenance connection, so test processes drop one
  database at a time. The wait is polled (`pg_try_advisory_lock`, 25 s bound); closing the
  connection also releases the lock, so a crashed holder cannot block anyone for long.
- The maintenance connection has `statement_timeout = 30s` and `connect_timeout = 10s`.
- The after-run teardown never throws or hangs: a busy lock, a 57014 timeout, a 57P01 terminated
  connection or a down server logs the database name and continues; `db:prune-test-dbs` sweeps it
  later. Prune bounds every drop (60 s), always exits with a code, and logs a failure as a line.
- `docker-compose.yml` sets `idle_in_transaction_session_timeout=60s` and `max_connections=200`;
  apply with `docker compose up -d --force-recreate db` (the volume stays).
