import { getTableName, type Table } from "drizzle-orm";
import type { Database } from "../client";

/**
 * One statement a `steppedDatabase` saw start: what it does, and the tables it names (for a
 * select, `from` and then each join, in order; for a write, its table). An insert also keeps
 * what it was given to write (`values`), so a test can find a row the code under test never
 * hands back, such as a session whose token must reach nobody.
 */
export type SteppedStatement = {
  kind: "select" | "insert" | "update" | "delete";
  tables: string[];
  values?: unknown;
};

export type StatementHold = {
  /** Resolves once the held statement is about to be sent: everything before it has run. */
  reached: Promise<SteppedStatement>;
  /** Sends it. */
  release: () => void;
};

export type SteppedOptions = {
  /** Holds the first statement this matches, unsent, until `hold.release()`. */
  holdWhen?: (statement: SteppedStatement) => boolean;
  /** Fails, unsent, each statement this returns an error for (as a dropped connection would). */
  failWhen?: (statement: SteppedStatement) => Error | undefined;
};

const STARTS = {
  select: "select",
  selectDistinct: "select",
  insert: "insert",
  update: "update",
  delete: "delete",
} as const;

const JOINS = new Set(["innerJoin", "leftJoin", "rightJoin", "fullJoin"]);

/** A table's SQL name; `sql` for anything else (a raw `from`). */
const nameOf = (value: unknown): string => {
  const name =
    typeof value === "object" && value !== null ? getTableName(value as Table) : undefined;
  return typeof name === "string" ? name : "sql";
};

const isStarter = (property: string | symbol): property is keyof typeof STARTS =>
  typeof property === "string" && Object.hasOwn(STARTS, property);

/**
 * `db`, with every query-builder statement recorded as it starts (`trace`); given `holdWhen`, the
 * first statement it matches held back unsent until `hold.release()`; given `failWhen`, the
 * statements it picks failed unsent. How a test runs another request's statements between two of
 * this one's, or makes one statement fail: deterministically, by order, never by timing or load
 * (CLAUDE.md, agent rules). Both are decided when the statement is awaited, by which time its
 * tables are all known. For the tests and the real-Neon auth smoke only; nothing in production
 * builds one.
 *
 * Relational queries (`db.query.*`) and raw `execute()` pass through untraced: Better Auth's
 * adapter uses neither in this config (no experimental joins), and our own statements on the
 * paths this serves use the query builder.
 */
export function steppedDatabase<D extends Database>(
  db: D,
  options: SteppedOptions = {},
): { db: D; trace: SteppedStatement[]; hold: StatementHold } {
  const { holdWhen, failWhen } = options;
  const trace: SteppedStatement[] = [];
  let armed = holdWhen !== undefined;
  let release = (): void => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reach = (_statement: SteppedStatement): void => {};
  const reached = new Promise<SteppedStatement>((resolve) => {
    reach = resolve;
  });

  /** A builder of `statement`'s chain: records its tables, fails or holds it at `then`. */
  const follow = (builder: object, statement: SteppedStatement): object =>
    new Proxy(builder, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (property === "then") {
          return (onFulfilled?: unknown, onRejected?: unknown) => {
            const failure = failWhen?.(statement);
            if (failure !== undefined) {
              return Promise.reject(failure).then(
                onFulfilled as (value: unknown) => unknown,
                onRejected as (reason: unknown) => unknown,
              );
            }
            if (armed && holdWhen?.(statement) === true) {
              armed = false;
              reach(statement);
              return released.then(() => value.call(target, onFulfilled, onRejected));
            }
            return value.call(target, onFulfilled, onRejected);
          };
        }
        return (...args: unknown[]) => {
          if (property === "from" || (typeof property === "string" && JOINS.has(property))) {
            statement.tables.push(nameOf(args[0]));
          }
          if (property === "values") statement.values = args[0];
          const result = value.apply(target, args);
          // The chain goes on through query builders (each one thenable); `execute()`'s own
          // promise has already sent the statement, so it is never held.
          const chained =
            property !== "execute" &&
            typeof result === "object" &&
            result !== null &&
            typeof (result as { then?: unknown }).then === "function";
          return chained ? follow(result, statement) : result;
        };
      },
    });

  const stepped = new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (!isStarter(property)) return value.bind(target);
      return (...args: unknown[]) => {
        const kind = STARTS[property];
        const statement: SteppedStatement = {
          kind,
          tables: kind === "select" ? [] : [nameOf(args[0])],
        };
        trace.push(statement);
        return follow(value.apply(target, args), statement);
      };
    },
  });

  return { db: stepped, trace, hold: { reached, release } };
}

/** `statement` as one string, `kind:table+table`, for traces a test compares. */
export const statementName = (statement: SteppedStatement): string =>
  `${statement.kind}:${statement.tables.join("+")}`;
