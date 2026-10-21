import type { Database } from "@opika/db";
import { getDb } from "../api/db";
import { withQueryErrorsCleaned } from "./clean-query-errors";

/**
 * The database every kabinet page, route and procedure reads and writes through: the served
 * database with its query errors cleaned (`withQueryErrorsCleaned`; F8-F1, the PW1-F8 review's
 * note 5). Why: an error thrown from a page or a route reaches Next's log whole, and Drizzle's
 * carries the statement's parameters. Today those are ids, but nothing would stop the next query
 * from carrying an address or a token, so the kabinet never holds the raw handle at all
 * (`kabinet-db-scan.test.ts` fails if a kabinet file imports `getDb` again).
 *
 * One handle per process: `getDb()` is memoised, and `withQueryErrorsCleaned` keeps one cleaned
 * handle per database, so each call returns the same object.
 */
export function kabinetDb(): Database {
  return withQueryErrorsCleaned(getDb());
}
