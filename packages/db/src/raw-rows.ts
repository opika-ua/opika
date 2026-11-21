import type { SQL } from "drizzle-orm";
import type { Database } from "./client";

/**
 * The one place a raw `db.execute()` result may be read.
 *
 * `createDatabase` hands back postgres-js locally and neon-http for any
 * `.neon.tech` host, typed as one `Database`. Their raw results differ: a
 * `RowList` array on postgres-js, `{ rows, fields, … }` on neon-http
 * (`drizzle-orm/neon-http/session.js` runs raw SQL with `fullResults: true`).
 * Code that reads the result as an array passes every local test and reads
 * nothing in production: `relaxationCounts` (#112) did. Prefer a typed `.select()`, whose rows the query builder maps the
 * same way on both drivers; this is for the statement the builder can't
 * express. `raw-execute-reads.test.ts` refuses a raw read anywhere else.
 *
 * Values arrive as each driver parses them (a `count(*)` is a string on both),
 * so the caller converts what it needs.
 */
export async function executeRows<Row extends Record<string, unknown>>(
  db: Database,
  query: SQL,
): Promise<Row[]> {
  return rowsOfRawResult<Row>(await db.execute(query));
}

/**
 * A raw statement as one item of `inOneTransaction`'s batch, for SQL the builder can't express.
 * Its result arrives in the driver's raw shape (neon-http's batch maps a raw query to the full
 * `{ rows }` result), so read it with `rowsOfRawResult`, never as an array.
 */
export function rawBatchItem(db: Database, query: SQL) {
  return db.execute(query);
}

/** Both drivers' raw result shapes, as one row list: `executeRows` and a batch's raw item. */
export function rowsOfRawResult<Row>(result: unknown): Row[] {
  if (Array.isArray(result)) return [...result] as Row[];
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return [...result.rows] as Row[];
  }
  throw new Error("A raw query result was neither a row list nor `{ rows }`.");
}
