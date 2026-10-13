import { ensureTestDatabase } from "./test-database";

/**
 * `pnpm --filter @opika/db run test-db:ensure`: creates the database in
 * `DATABASE_URL` if it is missing. The harness runs it ahead of migrate and
 * seed; it refuses anything but a local, derived test database
 * (`assertDisposableTestDatabase`), so it can't create or touch the dev one.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}
await ensureTestDatabase(url);
