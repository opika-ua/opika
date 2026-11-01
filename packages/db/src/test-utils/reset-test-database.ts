import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema/index";
import { truncateAll } from "./setup";
import { assertDisposableTestDatabase } from "./test-database";

/**
 * Empties every table of a disposable test database, `auth_*` included. The
 * harness runs it between migrate and seed (`apps/web/playwright.config.ts`).
 *
 * Why the seed's own truncate isn't enough: it leaves `auth_*` alone on
 * purpose (kabinet users survive a dev reseed), while seeded shelter ids are
 * deterministic and an invite's `auth_organization.slug` is the shelter id.
 * So a harness run stopped after a kabinet spec invited a seeded shelter
 * leaves its database behind (a Ctrl-C skips the dropping reporter, and
 * `KEEP_TEST_DB_ON_FAILURE=1` keeps it on purpose), and the next run's invite
 * reinserts the same slug and fails. Resetting here, at the start of a run,
 * leaves a kept database untouched until someone starts the next run.
 *
 * Refuses the dev database and any non-local host
 * (`assertDisposableTestDatabase`), so it can only ever empty a test database.
 */
export async function resetTestDatabaseRows(url: string): Promise<void> {
  const client = postgres(assertDisposableTestDatabase(url), { max: 1, onnotice: () => {} });
  try {
    await truncateAll(drizzle(client, { schema }));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  await resetTestDatabaseRows(url);
}
