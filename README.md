# Opika (Опіка)

A registry of verified Ukrainian shelters' animals, nationwide. Free for shelters, and no
money is handled: donations are external links to a shelter's own payment page.

All data in this repository is fictional; no real shelter or animal data is ever committed
here.

## What you can see

- **`/tvaryny`** - the gallery: a filterable grid of animals with nationwide city search.
- **`/tvaryny/[animalId]`** - an animal's page, with contact reveal.
- **`/prytulky/[shelterId]`** - a shelter's page.
- **`/zberezheni`** - the saved list.
- **`/pro`** and **`/prytulkam`** - about the project, and the page for shelters.
- **`/kabinet`** - the cabinet where verified shelters manage their own animals.

## Stack

| Layer | Choice |
|---|---|
| Client | Next.js 16 App Router, React 19, Tailwind v4 |
| API | oRPC contract-first, Zod 4 |
| Database | Postgres 18 (local: Docker; production: Neon), Drizzle ORM |
| Adopter session | Anonymous device session, no accounts |
| Shelter auth | Better Auth, magic-link sign-in for the kabinet |
| Images | Cloudflare R2, `sharp`-generated variants |
| Email | Resend (auth emails only) |
| Errors | Sentry (EU region, scrubbed) |
| Rate limits | Upstash |
| Hosting | Vercel |
| Testing | Vitest 4, Testing Library, Playwright (rendering harness) |
| Repo | pnpm workspaces + catalogs |

Full rationale and version sources: [`docs/stack-decision.md`](./docs/stack-decision.md).
Engineering rules: [`CLAUDE.md`](./CLAUDE.md) and
[`docs/standing-constraints.md`](./docs/standing-constraints.md).

## Running it locally

Local database only (Docker, `localhost:5433`); never point these commands at a hosted one.

```bash
corepack enable           # once per machine
pnpm i                    # resolves the pinned pnpm version
docker compose up -d      # Postgres + PostGIS on localhost:5433

# Create apps/web/.env.local (gitignored) with:
#   DATABASE_URL=postgresql://opika:opika@localhost:5433/opika
#   CURSOR_HMAC_SECRET=<openssl rand -hex 32>
# Section 3 of .env.example explains each value.

# The db scripts read DATABASE_URL from the shell, not from .env.local:
export DATABASE_URL=postgresql://opika:opika@localhost:5433/opika
pnpm --filter @opika/db run db:migrate   # apply the schema
pnpm --filter @opika/db run db:seed      # fictional cities, shelters and animals

pnpm --filter @opika/web dev
```

The seed script refuses any non-local database.

`docker-compose.yml` maps Postgres to host port 5433, not 5432; set `OPIKA_DB_PORT` to use
another. Stop the database with `docker compose down` (add `-v` to drop the data).

Moving from the old Postgres 17 image: its volume cannot be reused (PG18 changed the data directory
layout), so compose now uses a new volume. Run `docker compose stop db` (frees port 5433), then
`docker compose up -d`, then `db:migrate` and `db:seed`. The old volume is left in place; it can be
removed later with `docker volume rm opika_opika-db-data` (name is `<project>_opika-db-data`); the owner decides when.

## Checks

```bash
pnpm check   # typecheck -> lint -> test -> next build -> Playwright rendering harness
```

This is the same gate CI runs. The steps are also available separately (`pnpm typecheck`,
`pnpm lint`, `pnpm test`, `pnpm build:web`, `pnpm test:harness`).

## Repo layout

```
opika/
├─ apps/web/          # the Next.js app: adopter PWA and the shelter kabinet
├─ packages/
│  ├─ contracts/      # Zod schemas + the oRPC API contract
│  ├─ domain/         # pure business logic - no I/O, no framework
│  ├─ db/             # Drizzle schema, migrations, repositories, seed data
│  ├─ ui/             # cross-app freshness display
│  └─ i18n/           # uk/en message catalogues
└─ docs/              # architecture decisions, build plan, UI kit docs
```

## Where to go from here

- [`docs/build-plan.md`](./docs/build-plan.md) - what is built and what is next.
- [`docs/stack-decision.md`](./docs/stack-decision.md) - why each piece of the stack.
- [`docs/ui/README.md`](./docs/ui/README.md) - the UI kit and design tokens.
- [`CLAUDE.md`](./CLAUDE.md) - the engineering rules this repo holds itself to.

## Licence

Opika is licensed under the [GNU Affero General Public License v3.0](./LICENSE)
(AGPL-3.0-only): if you run a modified version as a public service, you must offer its
users the source of your modified version under the same licence. Third-party material
keeps its own licence; see [`NOTICE`](./NOTICE), the font folders under
`apps/web/src/app/fonts`, and the data-source credit on the site's `/pro` page.
