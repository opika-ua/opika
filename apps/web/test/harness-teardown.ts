import { dropTestDatabase, testDatabaseUrl } from "@opika/db/test";

/**
 * Drops this checkout's harness database after the run (Oleksii,
 * 2026-10-13): it is disposable by design, recreated, migrated and seeded
 * at the start of every run.
 */
export default async function harnessTeardown(): Promise<void> {
  await dropTestDatabase(testDatabaseUrl("harness"));
}
