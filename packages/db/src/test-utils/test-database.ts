import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { ambientSettingsText, checkProductionWrite } from "../prod-guard";

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
export const LOCAL_TEST_SERVER = "postgres://opika:opika@localhost:5433";

/** The repo root of the checkout this file sits in (packages/db/src/test-utils → four up). */
export const CHECKOUT_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");

/** The only names a test run creates, and the only names anything here will drop. */
export const DISPOSABLE_NAME = /^opika_(test|harness)_[0-9a-f]{8}$/;

/** `opika_test_<8 hex>` / `opika_harness_<8 hex>`, keyed on the checkout's absolute path. */
export function testDatabaseName(kind: "test" | "harness", checkoutPath: string): string {
  const hash = createHash("sha256").update(resolve(checkoutPath)).digest("hex").slice(0, 8);
  return `opika_${kind}_${hash}`;
}

/**
 * This checkout's harness port, 3100-3599, derived from its path like the
 * database name: two checkouts' harness runs can then go in parallel instead
 * of the second failing with "port already used" (the follow-up #88 left).
 * A collision between two paths is possible but rare, and loud when it
 * happens (Playwright refuses a used port; it never reuses a server).
 */
export function harnessPort(checkoutPath: string = CHECKOUT_ROOT): number {
  const hash = createHash("sha256").update(resolve(checkoutPath)).digest("hex");
  return 3100 + (Number.parseInt(hash.slice(0, 6), 16) % 500);
}

export const testDatabaseUrl = (kind: "test" | "harness", checkoutPath = CHECKOUT_ROOT): string =>
  `${LOCAL_TEST_SERVER}/${testDatabaseName(kind, checkoutPath)}`;

/**
 * Refuses anything but a local, disposable test database: never the dev
 * database, never a non-local host (a Neon host above all; the shared guard
 * with no production endpoint allows local hosts only), and never a name
 * outside the derived pattern, so an override can't point the drop at
 * something that matters. Messages never echo the URL (it carries a password).
 */
export function assertDisposableTestDatabase(url: string): string {
  const check = checkProductionWrite(url, [], undefined);
  if (check.kind !== "allowed") {
    // An ambient setting is named, so the fix is obvious: the URL itself may well be local.
    throw new Error(
      check.reason === "ambient_settings"
        ? `The test database setup refuses: ${ambientSettingsText(check.variables)}. Refusing.`
        : "The test database must be local (it is dropped and truncated). Refusing.",
    );
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
async function onServer<T>(
  url: string,
  run: (sql: postgres.Sql, name: string) => Promise<T>,
): Promise<T> {
  const target = new URL(assertDisposableTestDatabase(url));
  const name = target.pathname.slice(1);
  target.pathname = "/postgres";
  const sql = postgres(target.toString(), { max: 1, onnotice: () => {} });
  try {
    return await run(sql, name);
  } finally {
    await sql.end();
  }
}

/**
 * The database's COMMENT: which checkout it belongs to, on which machine.
 * The name is a one-way hash of the path, so without this nothing can tell
 * whether the checkout behind a database still exists, and
 * `db:prune-test-dbs` (`../tools/prune-test-dbs.ts`) would have to guess.
 * The path is recorded exactly as it was hashed (`resolve`), so the prune
 * can re-derive the name from it and refuse a comment that doesn't match.
 */
export type CheckoutComment = { checkout: string; host: string };

export const checkoutComment = (checkoutPath: string, host: string = hostname()): string =>
  JSON.stringify({ checkout: resolve(checkoutPath), host } satisfies CheckoutComment);

/** `null` for anything that isn't a comment `checkoutComment` wrote: no guess at what it meant. */
export function parseCheckoutComment(comment: string | null): CheckoutComment | null {
  if (comment === null) return null;
  try {
    const parsed: unknown = JSON.parse(comment);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { checkout, host } = parsed as Record<string, unknown>;
    if (typeof checkout !== "string" || checkout === "") return null;
    if (typeof host !== "string" || host === "") return null;
    return { checkout, host };
  } catch {
    return null;
  }
}

/** The name is this checkout's own derived name for one of the two kinds. */
const isDerivedFrom = (name: string, checkoutPath: string): boolean =>
  name === testDatabaseName("test", checkoutPath) ||
  name === testDatabaseName("harness", checkoutPath);

/**
 * Creates the database if it doesn't exist yet, and records which checkout
 * it belongs to (`checkoutComment`). The comment is written on every call,
 * not only at creation, so a database made before comments existed gains one
 * on its checkout's next run. It is written only when the name is the one
 * derived from `checkoutPath`: a `TEST_DATABASE_URL` override (or a test's
 * own throwaway name) names a database this checkout's path didn't produce,
 * and recording this path on it would claim an origin it doesn't have.
 */
export const ensureTestDatabase = (url: string, checkoutPath: string = CHECKOUT_ROOT) =>
  onServer(url, async (sql, name) => {
    const [exists] = await sql`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (exists === undefined) {
      try {
        await sql.unsafe(`CREATE DATABASE "${name}"`);
      } catch (error) {
        // Two first runs at once: the other one created it between our check
        // and our CREATE, which is the outcome wanted (42P04 duplicate_database).
        if ((error as { code?: string }).code !== "42P04") throw error;
      }
    }
    if (!isDerivedFrom(name, checkoutPath)) return;
    // COMMENT is a utility statement and takes no bind parameters, so the
    // literal is escaped here (standard_conforming_strings: only ' needs it).
    // The name is safe to interpolate: `assertDisposableTestDatabase` held it
    // to /^opika_(test|harness)_[0-9a-f]{8}$/ before we got here.
    const literal = checkoutComment(checkoutPath).replaceAll("'", "''");
    await sql.unsafe(`COMMENT ON DATABASE "${name}" IS '${literal}'`);
  });

/**
 * How a drop treats a database another session still has open.
 * - `force` closes those sessions (`WITH (FORCE)`). Only for a database
 *   nothing legitimate can still be using: `db:prune-test-dbs` drops only
 *   databases whose checkout is gone, and a test cleans up its own scratch one.
 * - `unless_in_use` leaves it alone. The after-run teardown uses this: one
 *   checkout has one test database, and a second run in the same tree (a
 *   reviewer's single unit file during a `pnpm check`) would otherwise drop it
 *   out from under the run still using it.
 */
export type DropMode = "force" | "unless_in_use";

export type DropResult = { kind: "dropped" } | { kind: "in_use" };

/** 55006 object_in_use: "database ... is being accessed by other users". */
const OBJECT_IN_USE = "55006";

/**
 * Drops it if it exists. Without FORCE, Postgres itself waits up to five
 * seconds for other sessions to go before giving up with 55006, so a
 * connection still closing as the run ends doesn't count as in use.
 */
export const dropTestDatabase = (url: string, mode: DropMode): Promise<DropResult> =>
  onServer(url, async (sql, name): Promise<DropResult> => {
    if (mode === "force") {
      await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      return { kind: "dropped" };
    }
    try {
      await sql.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
      return { kind: "dropped" };
    } catch (error) {
      if ((error as { code?: string }).code === OBJECT_IN_USE) return { kind: "in_use" };
      throw error;
    }
  });

/** The env flag that keeps a failed run's database for debugging. */
export const KEEP_ON_FAILURE_ENV = "KEEP_TEST_DB_ON_FAILURE";

/** How a run ended, in the words both runners use (vitest has no `timedout`; Playwright does). */
export type RunOutcome = "passed" | "failed" | "interrupted" | "timedout";

export type TestDatabaseDisposal =
  | { kind: "drop" }
  | { kind: "keep"; reason: "failed_run_with_keep_flag" | "in_use_by_another_session" };

/**
 * After a run, the database goes (Oleksii, 2026-10-13, relayed): it is
 * recreated, migrated and seeded at the start of every run, so keeping it
 * buys nothing, and keeping it is how nine of them piled up. The one
 * exception is a run that did not pass with `KEEP_TEST_DB_ON_FAILURE=1` set:
 * the rows it left are what you'd want to look at. Without the flag a failed
 * run drops too, so forgetting the flag never leaks a database.
 */
export function disposalAfterRun(
  outcome: RunOutcome,
  env: Readonly<Record<string, string | undefined>>,
): TestDatabaseDisposal {
  if (outcome !== "passed" && env[KEEP_ON_FAILURE_ENV] === "1") {
    return { kind: "keep", reason: "failed_run_with_keep_flag" };
  }
  return { kind: "drop" };
}

/**
 * The teardown both runners call. Never forced (`unless_in_use`): by the time
 * it runs, this run's own connections are closed (each DB-backed file ends
 * its client in `afterAll`; Playwright stops its workers and the web server
 * before `onEnd`), so a session still open belongs to another run in the same
 * checkout, and that run keeps its database. It is reused by the next run, or
 * dropped by whichever run ends last, or by `db:prune-test-dbs` later.
 *
 * A server that isn't running (`docker compose` down, a run of pure unit
 * tests only) is said, not thrown: there is nothing to drop, and the run's own
 * result shouldn't turn red over it. Any other failure throws. Prints the
 * database's name, never its URL.
 */
export async function disposeTestDatabaseAfterRun(
  url: string,
  outcome: RunOutcome,
  env: Readonly<Record<string, string | undefined>> = process.env,
  log: (line: string) => void = (line) => console.log(line),
  drop: (url: string) => Promise<DropResult> = (target) =>
    dropTestDatabase(target, "unless_in_use"),
): Promise<TestDatabaseDisposal> {
  const name = new URL(assertDisposableTestDatabase(url)).pathname.slice(1);
  const disposal = disposalAfterRun(outcome, env);
  if (disposal.kind === "keep") {
    log(`Kept test database ${name} for debugging (${KEEP_ON_FAILURE_ENV}=1, run ${outcome}).`);
    return disposal;
  }
  try {
    const dropped = await drop(url);
    if (dropped.kind === "in_use") {
      log(`Kept test database ${name}: another session is still using it.`);
      return { kind: "keep", reason: "in_use_by_another_session" };
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "ECONNREFUSED") throw error;
    log(
      `Test database server not reachable; ${name} not dropped (nothing to drop if it never ran).`,
    );
  }
  return disposal;
}
