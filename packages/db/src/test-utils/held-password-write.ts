import postgres from "postgres";
import { TEST_DATABASE_URL } from "./setup";

export type HeldPasswordWrite = {
  /**
   * `true` once another connection is waiting on a lock this write holds, `false` if `alongside`
   * settles first (it never had to wait). Asked of the database (`pg_blocking_pids`), never
   * guessed from time passing.
   */
  waitsOnIt: (alongside: Promise<unknown>) => Promise<boolean>;
  /** How many sessions the user has, as a third connection sees them (the write's not yet committed). */
  sessionsOf: (userId: string) => Promise<number>;
  /** Commits the write and closes its connections. */
  commit: () => Promise<void>;
};

/** How often `waitsOnIt` asks: a wait on a condition, not a timing the test depends on. */
const POLL_MS = 10;

/**
 * PW1-F6's forced case: a password write whose statement has run (the UPDATE, and PW1-F5's
 * trigger deleting the user's sessions inside it) but has not committed, as every write is for a
 * moment between its statement and its commit. Held open on a connection of its own, so the
 * test's own connection can run a sign-in into it, and committed when the test says. A test must
 * `commit()` in a `finally`: until then the row and the user's sessions stay locked.
 *
 * The local test database only (`TEST_DATABASE_URL`): neon-http has no transaction to hold open.
 */
export async function holdPasswordWriteUncommitted(
  userId: string,
  hash: string,
  now: Date,
): Promise<HeldPasswordWrite> {
  // One connection holds the transaction, the other observes.
  const client = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} });
  let release = (): void => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let written = (_pid: number): void => {};
  let failed = (_error: unknown): void => {};
  const ready = new Promise<number>((resolve, reject) => {
    written = resolve;
    failed = reject;
  });
  const transaction = client.begin(async (tx) => {
    const [me] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    await tx`
      UPDATE public.auth_account SET password = ${hash}, updated_at = ${now}
      WHERE user_id = ${userId} AND provider_id = 'credential'`;
    written(me?.pid ?? 0);
    await released;
  });
  transaction.catch(failed);
  const pid = await ready;

  return {
    async waitsOnIt(alongside) {
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
        const [row] = await client<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
        if ((row?.waiting ?? 0) > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      return false;
    },
    async sessionsOf(of) {
      const [row] = await client<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.auth_session WHERE user_id = ${of}`;
      return row?.n ?? -1;
    },
    async commit() {
      release();
      try {
        await transaction;
      } finally {
        await client.end();
      }
    },
  };
}
