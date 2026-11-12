# Opika (Опіка)

A registry of verified Ukrainian shelters' animals, nationwide. Free for shelters, and no
money is handled: donations are external links to a shelter's own payment page.

All data in this repository is fictional; no real shelter or animal data is ever committed
here.

## What you can see

- **`/tvaryny`** - the gallery: a grid of animals filtered by oblast and city (searchable lists),
  species, sex, size and age.
- **`/tvaryny/[animalId]`** - an animal's page, with contact reveal.
- **`/prytulky/[shelterId]`** - a shelter's page.
- **`/zberezheni`** - the saved list.
- **`/pro`** and **`/prytulkam`** - about the project, and the page for shelters.
- **`/kabinet`** - the cabinet: a shelter's invited admins manage its profile (`/kabinet/prytulok`)
  and animals (`/kabinet/tvaryny`); the operator runs the shelter registry (`/kabinet/prytulky`).
  Sign-in is at `/kabinet/vkhid`, a forgotten password at `/kabinet/vkhid/zabuly`, and a new one
  is set at `/kabinet/vkhid/novyi-parol`.

## Stack

| Layer | Choice |
|---|---|
| Client | Next.js 16.4 App Router, React 19.3, Tailwind 4.3 |
| API | oRPC 1.16 contract-first, Zod 4.6 |
| Database | Postgres 18 (local: Docker; production: Neon), Drizzle ORM 0.45 |
| Adopter session | Anonymous device session, no accounts |
| Shelter auth | Better Auth 1.7: a shelter admin signs in with email and password, or a magic link; the operator by magic link only, never a password |
| Images | Cloudflare R2, `sharp`-generated variants |
| Email | Resend: sign-in, invitation and password emails, and notification emails (operator and shelter notices, the weekly reminder) |
| Errors | Sentry (EU region, scrubbed) |
| Rate limits | Upstash |
| Hosting | Vercel |
| Testing | Vitest 4.1, Testing Library, happy-dom, Playwright 1.65 (rendering harness) |
| Repo | pnpm 11 workspaces + catalogs |

Versions are the `catalog:` pins in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml). Full
rationale: [`docs/stack-decision.md`](./docs/stack-decision.md).
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
