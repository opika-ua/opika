import { errorClassNameOf } from "./error-class-name";
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

/**
 * The cleaned error's name: one from the explicit list (`ERROR_CLASS_NAMES`), anything else
 * `Error`; and never `APIError` (F8-F1-D9). Better Auth and better-call take any error named
 * `APIError` for one (`isAPIError` reads the name), and answer it from its `status`, which a
 * cleaned error doesn't carry: better-call's `toResponse` throws a TypeError on it. A database
 * failure under an `APIError` is a plain 500.
 */
function cleanedNameOf(error: unknown): string {
  const name = errorClassNameOf(error);
  return name === "APIError" ? "Error" : name;
}

function cleaned(error: unknown, depth: number): CleanedQueryError {
  try {
    if (error instanceof CleanedQueryError) return error;
    const cause = field(error, "cause");
    const cleanedCause =
      depth < CAUSE_DEPTH && typeof cause === "object" && cause !== null
        ? cleaned(cause, depth + 1)
        : undefined;
    // Drizzle's own error has no SQLSTATE or names of its own: they're the driver's, its cause's.
    const facts = { ...schemaFactsOf(cleanedCause), ...schemaFactsOf(error) };
    return new CleanedQueryError(cleanedNameOf(error), facts, cleanedCause);
  } catch {
    // A getter or a Proxy that throws while being read: nothing of it is kept, its own error
    // included (the review of 73d03fa, finding 3).
    return new CleanedQueryError("Error", {});
  }
}

/**
 * `error`, cleaned (`CleanedQueryError`); one already cleaned is returned as it is.
 *
 * The cleaned chain keeps `CAUSE_DEPTH` links, but the facts never stop there: when the chain's own
 * links carry no SQLSTATE, the outermost cleaned error takes the facts of the first raw query error
 * the walk finds (`walkOf`), at any depth within its limit (F8-F2, the review of 72b8a3b, note 7).
 * Only the facts listed above move up, so nothing user-shaped does.
 */
export function cleanedQueryError(error: unknown): CleanedQueryError {
  const shallow = cleaned(error, 0);
  if (shallow === error || shallow.code !== undefined) return shallow;
  const deep = deepFactsOf(error);
  if (deep.code === undefined) return shallow;
  return new CleanedQueryError(
    shallow.name,
    { ...deep, ...schemaFactsOf(shallow) },
    shallow.cause instanceof CleanedQueryError ? shallow.cause : undefined,
  );
}

/** The schema facts of the first raw query error under `error`, its driver's (its `cause`) included. */
function deepFactsOf(error: unknown): SchemaFacts {
  try {
    const raw = walkOf(error).raw[0];
    return raw === undefined
      ? {}
      : { ...schemaFactsOf(field(raw, "cause")), ...schemaFactsOf(raw) };
  } catch {
    return {};
  }
}

const cleanedHandles = new WeakMap<object, object>();
const cleanHandles = new WeakSet<object>();

/**
 * `target` with each method it inherits (Drizzle's session or prepared query: `execute`, `all`,
 * `values`, `prepareQuery`, `batch`, `count`) cleaning what it throws or rejects with, and a
 * prepared query it hands out wrapped the same way; `transaction` as `cleanedTransaction` says.
 * Own function-valued properties (the driver's client) are left alone: Drizzle calls them inside
 * the wrapped methods, which is where their failures are caught.
 */
function cleaning<T extends object>(target: T): T {
  const proxy: T = new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object);
      if (typeof value !== "function" || Object.hasOwn(object, property)) return value;
      if (property === "transaction") return cleanedTransaction(value, proxy);
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

/** Whatever `Reflect.apply` can call: a method read off a Drizzle object. */
type Method = Parameters<typeof Reflect.apply>[0];

/**
 * Drizzle's query error (`DrizzleQueryError`: the statement's `query` and `params`) or a driver's
 * own (`PostgresError`, `NeonDbError`). Read by shape: the web app doesn't depend on drizzle-orm.
 */
function isQueryError(error: unknown): boolean {
  if (typeof field(error, "query") === "string" && Array.isArray(field(error, "params"))) {
    return true;
  }
  const name: unknown = error instanceof Error ? error.name : undefined;
  return name === "PostgresError" || name === "NeonDbError";
}

/** How many errors the walk looks at before it stops. */
const WALK_LIMIT = 64;

/**
 * What a walk over an error's `cause` and `errors` found: every raw query error (`isQueryError`)
 * in the order reached, and whether it saw everything (`complete`) or stopped first (`stopped`).
 */
type Walk = { kind: "complete" | "stopped"; raw: readonly object[] };

/**
 * The walk under `error`, through `cause` and `errors`. It stops on an error reached twice (a loop,
 * or one error held in two places), past `WALK_LIMIT` errors, on a read that throws, and on an
 * `errors` that is there but isn't an array (a `Set`, an array-like, a plain object): the walk
 * follows arrays only, so anything else may hold what it can't see. Oleksii, 2026-10-21, verbatim:
 * "In F8-F2, add one rule: if an error has an errors property that isn’t an array, the error is
 * cleaned (fail closed) instead of passed through, with a test using a Set."
 */
function walkOf(error: unknown): Walk {
  const seen = new Set<object>();
  const raw: object[] = [];
  const pending: unknown[] = [error];
  try {
    while (pending.length > 0) {
      const next = pending.pop();
      if (typeof next !== "object" || next === null) continue;
      if (seen.has(next) || seen.size >= WALK_LIMIT) return { kind: "stopped", raw };
      seen.add(next);
      if (isQueryError(next)) raw.push(next);
      pending.push(field(next, "cause"));
      if ("errors" in next) {
        const errors = field(next, "errors");
        if (!Array.isArray(errors)) return { kind: "stopped", raw };
        pending.push(...errors.toReversed());
      }
    }
  } catch {
    return { kind: "stopped", raw };
  }
  return { kind: "complete", raw };
}

/**
 * Whether what a transaction callback threw must be cleaned rather than passed through as itself:
 * a raw query error (`isQueryError`) is in it, under `cause` or under `errors` (an
 * `AggregateError`'s list, or any error carrying an array there), at any depth; or the walk
 * stopped before it could show there is none (`walkOf`: a loop, the limit, a read that throws, or
 * an `errors` that isn't an array), and a stopped walk always cleans. Oleksii, 2026-10-21,
 * verbatim: "when the cause walk stops (a loop or 64 links), the error is cleaned (fail closed),
 * never passed through." (F8-F1-D7, amended.)
 */
function mustBeCleaned(error: unknown): boolean {
  const walk = walkOf(error);
  return walk.kind === "stopped" || walk.raw.length > 0;
}

/**
 * `method` (a session's or a transaction's `transaction`), with its callback handed the
 * transaction cleaned (`withQueryErrorsCleaned`), so a statement that fails inside the callback
 * is cleaned at that statement, as on the top-level handle (F8-F1, the PW1-F8 review's note 1).
 *
 * What the callback throws reaches the caller unchanged (an `APIError`, Drizzle's rollback, a
 * statement's error already cleaned): it is the callback's answer, not a database error. Two
 * exceptions are cleaned: an error holding a raw query error under `cause` or `errors` at any
 * depth, or one whose walk stops (`mustBeCleaned`); and anything the transaction itself raises
 * (BEGIN, COMMIT, a savepoint, or neon-http's "no transactions", whose callback never runs).
 */
function cleanedTransaction(method: Method, receiver: object) {
  return async (callback: unknown, ...rest: unknown[]): Promise<unknown> => {
    let thrown: { error: unknown } | undefined;
    const cleanedCallback =
      typeof callback === "function"
        ? async (tx: unknown) => {
            try {
              return await callback(
                typeof tx === "object" && tx !== null ? withQueryErrorsCleaned(tx) : tx,
              );
            } catch (error) {
              thrown = { error };
              throw error;
            }
          }
        : callback;
    try {
      return await Reflect.apply(method, receiver, [cleanedCallback, ...rest]);
    } catch (error) {
      if (thrown !== undefined && thrown.error === error && !mustBeCleaned(error)) throw error;
      throw cleanedQueryError(error);
    }
  };
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
 * the session they were built with) are given it too, and a transaction's callback is handed the
 * transaction cleaned the same way (`cleanedTransaction`, F8-F1). What's raised is caught after
 * Drizzle has wrapped the driver's error, so nothing of either survives but the facts listed above.
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
  // A transaction's own `transaction` (a savepoint) doesn't go through the session's: cleaned here.
  const transaction = once(() => {
    const value = Reflect.get(db, "transaction");
    return typeof value === "function" ? cleanedTransaction(value, handle) : value;
  });
  const handle: D = withSession(db, cleanSession, { _: internals, query: relational, transaction });
  cleanedHandles.set(db, handle);
  cleanHandles.add(handle);
  return handle;
}
