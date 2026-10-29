import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { FULL_RESET_TABLES, RESET_EXCLUDED_TABLES } from "../full-reset";
import * as schema from "../schema/index";
import { assertDisposableTestDatabase, ensureTestDatabase, testDatabaseUrl } from "./test-database";

/**
 * The test database, and the one rule it gets: **local and disposable, no
 * escape hatch.** Every caller drops every application table
 * (`setupTestDatabase`) or truncates, so it is this checkout's own derived
 * database (`opika_test_<hash of the checkout path>`, `./test-database.ts`),
 * created on first use. An override (`TEST_DATABASE_URL`) must still be a
 * local, derived-pattern name; there is no `--prod` here, because no
 * legitimate test run targets a shared database. CI publishes its Postgres
 * service on localhost:5433 (`.github/workflows/ci.yml`), the same as
 * `docker compose`.
 *
 * Exported so the migration-backfill tests, which open their own clients,
 * read the same validated value rather than `process.env` directly.
 */
export const TEST_DATABASE_URL = assertDisposableTestDatabase(
  process.env.TEST_DATABASE_URL ?? testDatabaseUrl("test"),
);

/**
 * Resolve the drizzle/ migrations directory relative to this file.
 * `import.meta.url` is stable whether vitest runs from the package root
 * or the repo root.
 */
const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../../drizzle");

export type TestContext = {
  db: ReturnType<typeof drizzle<typeof schema>>;
};

/**
 * Call once in a `beforeAll` or at the top of a test file.
 *
 * Drops every application table, then applies the committed Drizzle
 * migrations - the same SQL that would run against a real database.
 * This keeps the test schema in sync with `packages/db/src/schema/*.ts`
 * automatically: adding a column and running `db:generate` produces a
 * migration file, and the next test run picks it up.
 *
 * Test isolation between individual tests uses TRUNCATE (see
 * `truncateAll`), not per-test migration runs.
 */
export async function setupTestDatabase() {
  await ensureTestDatabase(TEST_DATABASE_URL);
  const client = postgres(TEST_DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  // Drop every application table and the drizzle migration journal so
  // migrations apply cleanly from scratch on every test run.
  await client.unsafe(`
    DROP TABLE IF EXISTS r2_unreferenced_objects CASCADE;
    DROP TABLE IF EXISTS support_sessions CASCADE;
    DROP TABLE IF EXISTS invitation_created_users CASCADE;
    DROP TABLE IF EXISTS shelter_history CASCADE;
    DROP TABLE IF EXISTS super_admins CASCADE;
    DROP TABLE IF EXISTS auth_invitation CASCADE;
    DROP TABLE IF EXISTS auth_member CASCADE;
    DROP TABLE IF EXISTS auth_session CASCADE;
    DROP TABLE IF EXISTS auth_account CASCADE;
    DROP TABLE IF EXISTS auth_verification CASCADE;
    DROP TABLE IF EXISTS auth_organization CASCADE;
    DROP TABLE IF EXISTS auth_user CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS reveals CASCADE;
    DROP TABLE IF EXISTS swipes CASCADE;
    DROP TABLE IF EXISTS animals CASCADE;
    DROP TABLE IF EXISTS adopters CASCADE;
    DROP TABLE IF EXISTS shelters CASCADE;
    DROP TABLE IF EXISTS city_slug_aliases CASCADE;
    DROP TABLE IF EXISTS cities CASCADE;
    DROP TABLE IF EXISTS regions CASCADE;
    -- Outlives its tables otherwise; dropped so each run proves migration 0013 creates it.
    DROP FUNCTION IF EXISTS auth_account_password_revokes_sessions() CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  return {
    db,
    async cleanup() {
      await client.end();
    },
  };
}

/**
 * Every real table, derived from `full-reset.ts`'s own two lists rather
 * than kept as a third hand-written copy (Tier 1 review simplification, PR
 * #199) - `full-reset-table-coverage.test.ts` already proves those two
 * together are exactly the schema's real tables, so this can never drift
 * from that set the way an independent literal list could.
 */
const ALL_TABLES = [...FULL_RESET_TABLES, ...RESET_EXCLUDED_TABLES.map((entry) => entry.table)];

/** Migration data, not test data: `cities.region_id` needs these 27 rows to exist in every test. */
const KEPT_BETWEEN_TESTS = new Set(["regions"]);

/**
 * Truncate all tables between tests. Faster than dropping/recreating and
 * preserves the schema. `CASCADE` is fine here, unlike `full-reset.ts`'s own
 * production `TRUNCATE` - this always covers every real table already, so
 * there is nothing outside the list for `CASCADE` to reach.
 */
export async function truncateAll(db: ReturnType<typeof drizzle<typeof schema>>) {
  const list = ALL_TABLES.filter((table) => !KEPT_BETWEEN_TESTS.has(table))
    .map((table) => `"${table}"`)
    .join(", ");
  await db.execute(sql.raw(`TRUNCATE ${list} CASCADE`));
}
