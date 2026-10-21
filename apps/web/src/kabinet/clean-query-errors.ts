import { field, stringField } from "./fields";

/**
 * A failed query's error with everything but its schema facts dropped (PW1-F8). Oleksii,
 * 2026-10-20, verbatim: "What the cleaned error keeps: name, SQLSTATE, and the constraint and
 * table names (schema, never user data). It drops the message and the params."
 *
 * Why: Drizzle 0.45.2's query error carries the SQL and its parameters (an address, a session
 * token, a user id) in its message and as `query` and `params`, and the driver's error (its
 * `cause`) carries row values in its message, `detail` and `where`. Better Auth prints such an
 * error whole in one place (`@better-auth/core`'s fallback join, `console.error(error)`), and one
 * thrown from `auth.api.getSession` reaches Next's error log. Cleaned where the query fails, no
 * log anywhere can print what the error no longer holds.
 *
 * Kept: `name`; `code`, the SQLSTATE only (five digits or capitals); and the schema object names,
 * under both drivers' spellings, so every caller reads what it read before: postgres-js's
 * `PostgresError` says `constraint_name`, `table_name`, `schema_name`, `column_name`, neon-http's
 * `NeonDbError` says `constraint`, `table`, `schema`, `column`. The driver's error stays the
 * `cause`, cleaned the same way, so `cause.code` reads as before too. The message is empty; the
 * stack is where the error was cleaned, since the original's first line is its message.
 */
export class CleanedQueryError extends Error {
  declare readonly code?: string;
  declare readonly constraint?: string;
  declare readonly constraint_name?: string;
  declare readonly table?: string;
  declare readonly table_name?: string;
  declare readonly schema?: string;
  declare readonly schema_name?: string;
  declare readonly column?: string;
  declare readonly column_name?: string;

  constructor(name: string, facts: SchemaFacts, cause?: CleanedQueryError) {
    super("", cause === undefined ? undefined : { cause });
    this.name = name;
    Object.assign(this, facts);
  }
}

type SchemaFacts = Partial<Record<(typeof SCHEMA_NAMES)[number][number] | "code", string>>;

const SQLSTATE = /^[0-9A-Z]{5}$/;
/** A class name (`Error`, `PostgresError`, `NeonDbError`); anything else is shown as `Error`. */
const ERROR_NAME = /^[A-Za-z]{1,64}$/;
/** Each schema name under neon-http's spelling, then postgres-js's. */
const SCHEMA_NAMES = [
  ["constraint", "constraint_name"],
  ["table", "table_name"],
  ["schema", "schema_name"],
  ["column", "column_name"],
] as const;
/** How deep a cause chain is followed: Drizzle's error, the driver's, and one more. */
const CAUSE_DEPTH = 3;

function schemaFactsOf(error: unknown): SchemaFacts {
  const facts: SchemaFacts = {};
  const code = stringField(error, "code");
  if (code !== null && SQLSTATE.test(code)) facts.code = code;
  for (const [neon, postgresJs] of SCHEMA_NAMES) {
    const value = stringField(error, neon) ?? stringField(error, postgresJs);
    if (value !== null && value !== "") {
      facts[neon] = value;
      facts[postgresJs] = value;
    }
  }
  return facts;
}

function cleaned(error: unknown, depth: number): CleanedQueryError {
  if (error instanceof CleanedQueryError) return error;
  const cause = field(error, "cause");
  const cleanedCause =
    depth < CAUSE_DEPTH && typeof cause === "object" && cause !== null
      ? cleaned(cause, depth + 1)
      : undefined;
  // Drizzle's own error has no SQLSTATE or names of its own: they're the driver's, its cause's.
  const facts = { ...schemaFactsOf(cleanedCause), ...schemaFactsOf(error) };
  const name = error instanceof Error ? error.name : "";
  return new CleanedQueryError(ERROR_NAME.test(name) ? name : "Error", facts, cleanedCause);
}

/** `error`, cleaned (`CleanedQueryError`); one already cleaned is returned as it is. */
export const cleanedQueryError = (error: unknown): CleanedQueryError => cleaned(error, 0);

const cleanedHandles = new WeakMap<object, object>();
const cleanHandles = new WeakSet<object>();

/**
 * `target` with each method it inherits (Drizzle's session or prepared query: `execute`, `all`,
 * `values`, `prepareQuery`, `transaction`, `batch`, `count`) cleaning what it throws or rejects
 * with, and a prepared query it hands out wrapped the same way. Own function-valued properties
 * (the driver's client) are left alone: Drizzle calls them inside the wrapped methods, which is
 * where their failures are caught.
 */
function cleaning<T extends object>(target: T): T {
  const proxy: T = new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object);
      if (typeof value !== "function" || Object.hasOwn(object, property)) return value;
      return (...args: unknown[]) => {
        let result: unknown;
        try {
          result = Reflect.apply(value, proxy, args);
        } catch (error) {
          throw cleanedQueryError(error);
        }
        if (result === object) return proxy;
        if (result instanceof Promise) {
          return result.catch((error: unknown) => {
            throw cleanedQueryError(error);
          });
        }
        return typeof result === "object" &&
          result !== null &&
          typeof field(result, "execute") === "function"
          ? cleaning(result)
          : result;
      };
    },
  });
  return proxy;
}

/** `target` reading `session` (and each of `overrides`) from the given functions, on first use. */
function withSession<T extends object>(
  target: T,
  session: () => object,
  overrides: Readonly<Record<string, () => unknown>> = {},
): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === "session") return session();
      if (typeof property === "string" && Object.hasOwn(overrides, property)) {
        return overrides[property]?.();
      }
      return Reflect.get(object, property, receiver);
    },
  });
}

/** `compute`'s value, computed once, when first asked for. */
function once<T>(compute: () => T): () => T {
  let done: { value: T } | undefined;
  return () => {
    done ??= { value: compute() };
    return done.value;
  };
}

/**
 * `db`, with every query error it raises cleaned (`CleanedQueryError`): the handle Better Auth is
 * given, and the one our auth hooks and the kabinet's principal read through (PW1-F8; Oleksii's
 * Q1, verbatim: "Q1, F8: (i), clean query errors at the database handle Better Auth is given,
 * plus the review’s three notes.").
 *
 * Cleaned at Drizzle's session, which every statement goes through on both drivers: a query
 * builder reads `this.session` when it is built, so a builder built from this handle executes
 * through the cleaning one; `db._.session` and the relational builders (`db.query.*`, which keep
 * the session they were built with) are given it too. What's raised is caught after Drizzle has
 * wrapped the driver's error, so nothing of either survives but the facts listed above.
 *
 * One limit: a proxy that calls `db`'s methods on `db` itself, not on the proxy (the tests'
 * `steppedDatabase`), builds from the original session, so wrapping it here cleans nothing it
 * builds. Wrap inside such a proxy instead: `steppedDatabase(withQueryErrorsCleaned(db))`.
 * Production passes the database itself. Idempotent, and one handle per database.
 */
export function withQueryErrorsCleaned<D extends object>(db: D): D {
  if (cleanHandles.has(db)) return db;
  const known = cleanedHandles.get(db);
  if (known !== undefined) return known as D;
  // Read on first use, not here: a caller may hold a handle it never queries.
  const cleanSession = once(() => {
    const session = Reflect.get(db, "session");
    if (typeof session !== "object" || session === null) {
      // A Drizzle upgrade that moves the session must fail here, loudly, not run uncleaned.
      throw new Error("withQueryErrorsCleaned: this database has no Drizzle session");
    }
    return cleaning(session);
  });
  const internals = once(() => {
    const value = Reflect.get(db, "_");
    return typeof value === "object" && value !== null
      ? { ...value, session: cleanSession() }
      : value;
  });
  const relational = once(() => {
    const value = Reflect.get(db, "query");
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([name, builder]) => [
        name,
        typeof builder === "object" && builder !== null
          ? withSession(builder, cleanSession)
          : builder,
      ]),
    );
  });
  const handle = withSession(db, cleanSession, { _: internals, query: relational });
  cleanedHandles.set(db, handle);
  cleanHandles.add(handle);
  return handle;
}
