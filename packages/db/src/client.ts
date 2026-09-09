import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgresJs, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

/**
 * True only when this connection string actually points at Neon — the one
 * case `drizzle-orm/neon-http`'s stateless HTTP driver can talk to.
 * Local dev and every test point at a local Postgres (docker-compose)
 * instead, which speaks the plain wire protocol and nothing else; the
 * HTTP driver has no way to reach it at all, so this is a hard branch,
 * not a preference.
 *
 * `.toLowerCase()` on the hostname is load-bearing, not defensive noise:
 * `postgres:` is not a WHATWG "special" scheme, so `URL` does not
 * lowercase its host the way it would for `https:` — an uppercased
 * hostname in a real `DATABASE_URL` would otherwise fall through to the
 * TCP driver silently, with nothing erroring, undoing this whole row
 * without a single red test or log line. Caught on review.
 *
 * Parsing is wrapped rather than left to throw `new URL`'s own error
 * directly: that error's `input` property is the *entire* connection
 * string, password included, and would otherwise reach whatever logs or
 * reports the thrown error. Rethrown without it.
 */
export function isNeonHost(connectionString: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string URL");
  }
  return hostname.toLowerCase().endsWith(".neon.tech");
}

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * O-9, 2026-09-06 reprioritisation ("2.1"): production's DB-backed pages
 * plateaued at a ~1s floor — every Vercel function invocation paid a
 * fresh TCP+TLS handshake to Neon (`aws-eu-central-1`) from a function
 * executing in `iad1` (US East), on top of the Atlantic round trip
 * itself. `@neondatabase/serverless` + `drizzle-orm/neon-http` replace
 * that with one HTTP fetch per query, no handshake to repeat — the
 * dependency is justified on its own terms (MIT, zero transitive
 * dependencies, the only way to reach Neon over HTTP at all), not because
 * `docs/stack-decision.md:143`'s "PgBouncer + an HTTP serverless driver"
 * already approved this specific choice — that line is a vendor-feature
 * bullet in a comparison table, not a decision record for this row.
 *
 * **Does not address the other named half of O-9's diagnosis on its
 * own**: the function still executes in `iad1` with no `regions` pin
 * anywhere in `apps/web/vercel.json`, so every request still crosses the
 * Atlantic — this row only removes the handshake paid on top of that
 * crossing, not the crossing itself.
 *
 * Branches on the connection string, not on `process.env.VERCEL` or
 * similar — the actual fact that matters is which database this is
 * talking to, not which platform is running the code.
 *
 * Return type is annotated `Database` (`PostgresJsDatabase`) even on the
 * Neon branch, which really returns a `NeonHttpDatabase` at runtime — a
 * deliberate, narrow cast, not a lie about behaviour, and not a claim
 * that the two adapter classes are interchangeable in general — they are
 * not: `drizzle-orm/neon-http` throws at runtime on `db.transaction()`
 * ("No transactions support in neon-http driver"), which this file's
 * `Database` type does NOT reject at compile time. Nothing in
 * `packages/db/src/repos` calls `.transaction()` today (verified: `grep
 * -rn "\.transaction(" packages/db/src/repos` is empty) — if that ever
 * changes, it will typecheck cleanly and crash only against Neon in
 * production, never locally against postgres-js. The narrower claim this
 * cast actually rests on: nothing in the repo layer calls `.execute()` or
 * otherwise touches the raw `TQueryResult` shape that genuinely differs
 * between adapters (a `RowList` array for postgres-js vs a `{ rows: T[] }`
 * object for neon-http, `drizzle-orm/{postgres-js,neon-http}/session.d.ts`)
 * — verified the same way, and every repository call is a plain
 * `.select()/.insert()/.update()/.delete()` chain, whose *typed row*
 * return shape Drizzle's query builder normalises identically regardless
 * of adapter. A real union (`PostgresJsDatabase | NeonHttpDatabase`) was
 * tried first and rejected: it made `swipeRepo.record`'s
 * `.onConflictDoUpdate(...).returning(...)` fail to typecheck (`Expected
 * 0 arguments, but got 1`) — a TypeScript overload-resolution artifact of
 * unioning two generically-parameterised classes, confirmed by the same
 * call typechecking cleanly against each adapter individually in
 * isolation, not a real behavioural incompatibility between them for
 * anything this codebase actually calls.
 */
export function createDatabase(connectionString: string): Database {
  if (isNeonHost(connectionString)) {
    return drizzleNeonHttp(neon(connectionString), { schema }) as unknown as Database;
  }
  const sql = postgres(connectionString);
  return drizzlePostgresJs(sql, { schema });
}

export function createDatabaseWithClient(sql: postgres.Sql): Database {
  return drizzlePostgresJs(sql, { schema });
}
