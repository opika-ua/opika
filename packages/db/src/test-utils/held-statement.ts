import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../client";
import * as schema from "../schema/index";
import { TEST_DATABASE_URL } from "./setup";

export type HeldStatementDatabase = {
  /** A database on a connection of its own; the first statement `matches` picks runs held. */
  db: Database;
  /** Resolves once that statement has run inside its open transaction, with its backend's pid. */
  ran: Promise<number>;
  /**
   * `true` once another connection is waiting on a lock the held transaction holds, `false` if
   * `alongside` settles first (it never had to wait). Asked of the database (`pg_blocking_pids`),
   * never guessed from time passing.
   */
  waitsOnIt: (alongside: Promise<unknown>) => Promise<boolean>;
  /** Commits the held transaction; the statement's result then goes back to its caller. */
  release: () => void;
  /** Closes both connections. Call in a `finally`, after `release()`. */
  end: () => Promise<void>;
};

/** How often `waitsOnIt` asks: a wait on a condition, not a timing the test depends on. */
const POLL_MS = 10;

/**
 * Two requests' statements meeting in Postgres itself, forced, never raced (CLAUDE.md, agent
 * rules): the first statement `matches` picks runs on this database's own connection inside a
 * transaction that stays open (its row locks held) until `release()`, and only then answers its
 * caller. Another connection's statement on the same rows meanwhile waits on those locks, as two
 * concurrent requests' would; `waitsOnIt` proves it did. Every other statement runs as usual.
 *
 * The local test database only (`TEST_DATABASE_URL`): neon-http has no transaction to hold open.
 */
export function holdStatementUncommitted(
  matches: (query: string) => boolean,
): HeldStatementDatabase {
  // One connection, so `begin` and the held statement share it (postgres-js allows a manual
  // transaction only with max: 1); the observer asks from its own.
  const holder = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  const observer = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  let release = (): void => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reportRan = (_pid: number): void => {};
  const ran = new Promise<number>((resolve) => {
    reportRan = resolve;
  });
  let armed = true;

  const holding = async (query: string, params: unknown[], values: boolean) => {
    await holder.unsafe("BEGIN");
    try {
      const [me] = await holder.unsafe<{ pid: number }[]>("SELECT pg_backend_pid() AS pid");
      const result = values
        ? await holder.unsafe(query, params as never[]).values()
        : await holder.unsafe(query, params as never[]);
      reportRan(me?.pid ?? 0);
      await released;
      await holder.unsafe("COMMIT");
      return result;
    } catch (error) {
      await holder.unsafe("ROLLBACK");
      throw error;
    }
  };

  const client = new Proxy(holder, {
    get(target, property, receiver) {
      if (property !== "unsafe") return Reflect.get(target, property, receiver);
      return (query: string, params: unknown[] = [], ...rest: unknown[]) => {
        if (!armed || !matches(query)) {
          return (target.unsafe as (...args: unknown[]) => unknown)(query, params, ...rest);
        }
        armed = false;
        // Drizzle awaits the query, or calls `.values()` on it: whichever it does runs it, once.
        let run: Promise<unknown> | undefined;
        return {
          // biome-ignore lint/suspicious/noThenProperty: Drizzle awaits what `unsafe` returns.
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
            run ??= holding(query, params, false);
            return run.then(resolve, reject);
          },
          values: () => {
            run ??= holding(query, params, true);
            return run;
          },
        };
      };
    },
  });

  return {
    db: drizzle(client, { schema }) as unknown as Database,
    ran,
    async waitsOnIt(alongside) {
      const pid = await ran;
      let settled = false;
      alongside.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      while (!settled) {
        const [row] = await observer<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
        if ((row?.waiting ?? 0) > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      return false;
    },
    release,
    async end() {
      release();
      await Promise.all([holder.end({ timeout: 0 }), observer.end({ timeout: 0 })]);
    },
  };
}
