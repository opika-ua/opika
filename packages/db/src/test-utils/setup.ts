import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../schema/index.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://opika:opika@localhost:5433/opika_test";

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
 * migrations — the same SQL that would run against a real database.
 * This keeps the test schema in sync with `packages/db/src/schema/*.ts`
 * automatically: adding a column and running `db:generate` produces a
 * migration file, and the next test run picks it up.
 *
 * Test isolation between individual tests uses TRUNCATE (see
 * `truncateAll`), not per-test migration runs.
 */
export async function setupTestDatabase() {
  const client = postgres(TEST_DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  // Drop every application table and the drizzle migration journal so
  // migrations apply cleanly from scratch on every test run.
  await client.unsafe(`
    DROP TABLE IF EXISTS reveals CASCADE;
    DROP TABLE IF EXISTS swipes CASCADE;
    DROP TABLE IF EXISTS animals CASCADE;
    DROP TABLE IF EXISTS adopters CASCADE;
    DROP TABLE IF EXISTS shelters CASCADE;
    DROP TABLE IF EXISTS cities CASCADE;
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
 * Truncate all tables between tests. Faster than dropping/recreating and
 * preserves the schema.
 */
export async function truncateAll(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db.execute(sql`TRUNCATE reveals, swipes, animals, adopters, shelters, cities CASCADE`);
}
