import type { Database } from "@opika/db";
import { getDb } from "../api/db";
import { withQueryErrorsCleaned } from "./clean-query-errors";

/**
 * `db` as the kabinet holds it: its query errors cleaned (`withQueryErrorsCleaned`). The one
 * rule `kabinetDb()` applies to the served database, apart so the auth smoke can apply it to its
 * own target (step 20) without `getDb()` reading `DATABASE_URL` and opening a second connection.
 */
export function kabinetDbOver(db: Database): Database {
  return withQueryErrorsCleaned(db);
}

/**
 * The database every kabinet page, route and procedure reads and writes through: the served
 * database with its query errors cleaned (F8-F1, the PW1-F8 review's note 5). Why: an error
 * thrown from a page or a route reaches Next's log whole, and Drizzle's carries the statement's
 * parameters. Today those are ids, but nothing would stop the next query from carrying an address
 * or a token, so the kabinet never holds the raw handle at all (`kabinet-db-scan.test.ts` fails if
 * a module the kabinet reaches imports `getDb` again; `kabinet-db.test.ts` pins this function).
 *
 * One handle per process: `getDb()` is memoised, and `withQueryErrorsCleaned` keeps one cleaned
 * handle per database, so each call returns the same object.
 */
export function kabinetDb(): Database {
  return kabinetDbOver(getDb());
}
