# Opika (Опіка)

A swipe-based pet adoption platform connecting adopters with verified shelters in Kyiv
oblast, Ukraine. "Opika" — Ukrainian for guardianship/care — is a working name, not final;
see [`CLAUDE.md`](./CLAUDE.md) for what that means in practice.

No accounts required to browse. The platform never touches money — donations are external
links to a shelter's own payment page. All data in this repository is fictional; no real
shelter or animal data is ever committed here.

## What you can actually see right now

The product is being built phase by phase (current status:
[`docs/build-plan.md`](./docs/build-plan.md)). Two routes exist today:

- **`/`** — the entry screen: promise, disclaimer, a city selector seeded from real
  (fictional) cities in the database.
- **`/discovery`** — the swipe deck. Pointer/touch drag, or the on-screen buttons, to move
  through animals one at a time.

The gallery (a browsable grid — the primary surface once it lands) and everything past it
are not built yet; the backend contracts and schema for it landed in Phase E0, but there's
no page for it. Don't expect to find it by clicking around.

## Stack, briefly

| Layer | Choice |
|---|---|
| Client | Next.js 16 App Router, React 19, Tailwind v4 |
| API | oRPC contract-first, Zod 4 |
| Database | Postgres 17 (local: Docker; production: Neon), Drizzle ORM |
| Auth | Hand-rolled anonymous device session (no accounts at this stage) |
| Testing | Vitest 4, Testing Library, Playwright (rendering harness) |
| Repo | pnpm workspaces + catalogs |

Full rationale and version sources: [`docs/stack-decision.md`](./docs/stack-decision.md).
Day-to-day engineering rules: [`CLAUDE.md`](./CLAUDE.md) and
[`docs/standing-constraints.md`](./docs/standing-constraints.md).

## Running it locally

```bash
# Once per machine
corepack enable

# Install — resolves the pinned pnpm version automatically
pnpm i

# Local Postgres (Docker), mapped to localhost:5433
docker compose up -d

# Seed fictional data — cities, shelters, animals.
# DATABASE_URL isn't picked up from .env by the seed script; pass it explicitly.
DATABASE_URL="postgresql://opika:opika@localhost:5433/opika" pnpm --filter @opika/db run db:seed

# Start the dev server
DATABASE_URL="postgresql://opika:opika@localhost:5433/opika" pnpm --filter @opika/web dev
```

Then open **http://localhost:3000**.

`docker-compose.yml` maps the container's Postgres to host port **5433**, not the
Postgres-standard 5432 — the `OPIKA_DB_PORT` override in `docker-compose.yml` if you need
a different one. Passing `DATABASE_URL` on the command line (as above) is the reliable
path today; see [issue #22](https://github.com/opika-ua/opika/issues/22) for the config
default that will eventually make this unnecessary.

Stop the database with `docker compose down` (add `-v` to also drop the seeded data).

## Testing and checks

```bash
pnpm check   # typecheck -> lint -> test -> next build -> Playwright rendering harness
```

This is the same gate CI runs, and the standing bar for any change: it must pass on a
clean clone before anything is considered done. Individual steps (`pnpm typecheck`,
`pnpm lint`, `pnpm test`, `pnpm build:web`, `pnpm test:harness`) are also available
separately — see `package.json`'s `scripts`.

## Repo layout

```
opika/
├─ apps/web/          # the Next.js app — adopter-facing PWA
├─ packages/
│  ├─ contracts/      # Zod schemas + the oRPC API contract
│  ├─ domain/         # pure business logic — no I/O, no framework
│  ├─ db/             # Drizzle schema, migrations, repositories, seed data
│  ├─ ui/             # shared UI primitives used across features
│  └─ i18n/           # uk/en message catalogues
└─ docs/              # design handoff, architecture decisions, the build plan
```

`CLAUDE.md` has the full, current version of this layout and the reasoning behind it.

## Where to go from here

- [`docs/build-plan.md`](./docs/build-plan.md) — what's built, what's next, hour estimates.
- [`docs/design/README.md`](./docs/design/README.md) — the design handoff: every screen,
  the string table, motion and spacing specs.
- [`docs/stack-decision.md`](./docs/stack-decision.md) — why each piece of the stack was
  chosen, with sources.
- [`CLAUDE.md`](./CLAUDE.md) — the engineering rules this repo holds itself to, and why
  each one exists.
