import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { checkProductionWrite } from "../prod-guard";

/**
 * Every checkout gets its own disposable test databases, named after its
 * absolute path (Oleksii, 2026-10-13): two checkouts of this repo on one
 * machine (a review worktree beside the main one) then never truncate each
 * other's data. Before this, vitest and the harness both used one fixed
 * `opika_test`, and a test run in one checkout wiped the harness's seeded
 * rows in the other, mid-run.
 */

/** The dev database (`docker compose`, `db:seed` by hand). A test run never touches it. */
export const DEV_DATABASE_NAME = "opika";

/** The local server every test database lives on: `docker compose` and CI both publish it on 5433. */
const LOCAL_SERVER = "postgres://opika:opika@localhost:5433";

/** The repo root of the checkout this file sits in (packages/db/src/test-utils → four up). */
export const CHECKOUT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");

const DISPOSABLE_NAME = /^opika_(test|harness)_[0-9a-f]{8}$/;

/** `opika_test_<8 hex>` / `opika_harness_<8 hex>`, keyed on the checkout's absolute path. */
export function testDatabaseName(kind: "test" | "harness", checkoutPath: string): string {
  const hash = createHash("sha256").update(resolve(checkoutPath)).digest("hex").slice(0, 8);
  return `opika_${kind}_${hash}`;
}

export const testDatabaseUrl = (kind: "test" | "harness", checkoutPath = CHECKOUT_ROOT): string =>
  `${LOCAL_SERVER}/${testDatabaseName(kind, checkoutPath)}`;

/**
 * Refuses anything but a local, disposable test database: never the dev
 * database, never a non-local host (a Neon host above all; the shared guard
 * with no production endpoint allows local hosts only), and never a name
 * outside the derived pattern, so an override can't point the drop at
 * something that matters. Messages never echo the URL (it carries a password).
 */
export function assertDisposableTestDatabase(url: string): string {
  if (checkProductionWrite(url, [], undefined).kind !== "allowed") {
    throw new Error("The test database must be local (it is dropped and truncated). Refusing.");
  }
  const parsed = new URL(url);
  // postgres.js reads connection options from the query string, and a
  // `?database=` there overrides the path: the name below would be checked
  // while another database is opened (review, finding 1). No URL here needs
  // options, so any query string or fragment is refused outright.
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error("The test database URL may carry no query string or fragment. Refusing.");
  }
  const name = parsed.pathname.slice(1);
  if (!DISPOSABLE_NAME.test(name)) {
    throw new Error(
      `The test database must be a derived opika_test_/opika_harness_ name, never "${DEV_DATABASE_NAME}". Refusing.`,
    );
  }
  return url;
}

/** Runs one statement against the same server's maintenance database, where CREATE/DROP DATABASE run. */
async function onServer(url: string, run: (sql: postgres.Sql, name: string) => Promise<unknown>) {
  const target = new URL(assertDisposableTestDatabase(url));
  const name = target.pathname.slice(1);
  target.pathname = "/postgres";
  const sql = postgres(target.toString(), { max: 1, onnotice: () => {} });
  try {
    await run(sql, name);
  } finally {
    await sql.end();
  }
}

/** Creates the database if it doesn't exist yet. */
export const ensureTestDatabase = (url: string) =>
  onServer(url, async (sql, name) => {
    const [exists] = await sql`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (exists !== undefined) return;
    try {
      await sql.unsafe(`CREATE DATABASE "${name}"`);
    } catch (error) {
      // Two first runs at once: the other one created it between our check
      // and our CREATE, which is the outcome wanted (42P04 duplicate_database).
      if ((error as { code?: string }).code !== "42P04") throw error;
    }
  });

/** Drops it, closing any connection still open (the harness server may not have exited yet). */
export const dropTestDatabase = (url: string) =>
  onServer(url, (sql, name) => sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
