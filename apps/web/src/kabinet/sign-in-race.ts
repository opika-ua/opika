import type { Database } from "@opika/db";
import { authPasswordWriteRepo, type PasswordWrite } from "@opika/db/repos";
import { sqlStateOf } from "./sql-state";

/**
 * What a password sign-in's second read found (PW1-F6). Only `unchanged` lets a successful
 * sign-in stand; every other answer fails closed.
 */
export type PasswordWriteCheck =
  | { kind: "unchanged" }
  /** A reset or a change wrote the password while the sign-in ran (or a credential came or went). */
  | { kind: "written" }
  /** No first read for this request, so nothing to compare with. */
  | { kind: "not_begun" }
  /** The second read failed; its SQLSTATE, when there is one, and nothing else of the error. */
  | { kind: "unreadable"; sqlState: string | null };

const sameWrite = (a: PasswordWrite, b: PasswordWrite | undefined): boolean =>
  b !== undefined &&
  a.accountId === b.accountId &&
  a.updatedAt.getTime() === b.updatedAt.getTime() &&
  a.hash === b.hash;

/** The same credentials, each as the same write left it (`authPasswordWriteRepo` sorts by id). */
export const sameWrites = (
  before: readonly PasswordWrite[],
  after: readonly PasswordWrite[],
): boolean =>
  before.length === after.length && before.every((write, i) => sameWrite(write, after[i]));

/**
 * PW1-F6: a password sign-in must not keep a session when the password was written while it ran.
 *
 * Better Auth 1.6.33's sign-in (`dist/api/routes/sign-in.mjs`) reads the stored hash, runs scrypt
 * (tens of milliseconds), and only then inserts its session. A reset or a change that writes the
 * new password in between ends every session there is at that moment (PW1-F5, in the write's own
 * statement) and Better Auth's revoke follows, but the sign-in's insert comes later, so without
 * this its session, made with the old password, would outlive both. Oleksii, 2026-10-20, verbatim
 * excerpt: "The check: after a successful password sign-in, if the password was written after the
 * request began, delete the session it just created and return the usual single failure. Run the
 * check on every sign-in so the timing stays identical."
 *
 * **How "written after the request began" is decided: two reads, no clocks.** `begin` reads the
 * user's credentials (`authPasswordWriteRepo`) before Better Auth reads the hash, `settle` reads
 * them again after Better Auth has answered, and a write in between shows as a difference: a
 * moved `updated_at` (which Better Auth stamps on every password write) or a new hash (a fresh
 * salt on every write). Nothing compares a time written on one server with a time read on
 * another; the stamp is only ever compared with itself.
 *
 * **The second read waits for a write in flight** (`committedWritesByEmail`, `FOR SHARE`). A
 * password write is one statement: the UPDATE, inside which PW1-F5's trigger deletes the user's
 * sessions, and then its commit. Until that commit any other read still sees the old row. So a
 * plain second read, run after the trigger's delete but before the commit, would find nothing
 * changed and keep a session inserted after that delete (the review of this change forced exactly
 * that: 200, the session alive after the commit). `FOR SHARE` waits for the UPDATE's row lock and
 * then reads what it committed. The first read stays plain: a write it cannot see yet can only
 * make the second differ.
 *
 * With that, every order of the two requests ends with no session made with the old password.
 * The write's UPDATE (trigger included) runs, then commits:
 * - committed before `begin`: Better Auth reads the new hash, and the old password fails;
 * - committed between `begin` and Better Auth's read: the old password fails the same way, and
 *   even the new one is refused this once (the reads differ), the conservative side;
 * - the UPDATE runs after the sign-in's insert: its trigger deletes that session (PW1-F5), and
 *   `settle`, if it comes after, refuses the answer too;
 * - the UPDATE runs between Better Auth's read and the insert (the race), committed or not by
 *   the time `settle` runs: `settle` comes after the insert, so after the UPDATE, and either
 *   reads the committed row or waits for it; it sees the write, deletes the session the sign-in
 *   just inserted, and answers the generic failure. A write that rolls back changes nothing.
 * - the UPDATE runs before Better Auth's read, even before `begin`, and commits only after the
 *   insert (the forced test's order: "forced: a write whose statement ran …" in
 *   `password-flows.test.ts`): both plain reads still see the old row, so the old password
 *   passes and the session is inserted after the trigger's delete; `settle` waits for the
 *   commit, reads the new row, and refuses, as in the race above.
 * - A first password is an INSERT, with no row to wait on and nothing to race: the user had no
 *   password, so Better Auth's read found none and the sign-in failed.
 *
 * The request is the per-call context object Better Auth hands both hooks (`ctx.context`), so a
 * `begin` is found only by its own request's `settle`, held weakly, and dropped once settled.
 */
export function signInRaceCheck(db: Database) {
  const repo = authPasswordWriteRepo(db);
  const begun = new WeakMap<object, { email: string; writes: readonly PasswordWrite[] }>();
  return {
    /**
     * Before Better Auth reads the hash. A failure is the request's (as the operator-grant query
     * beside it): nothing has been created yet, and the sign-in answers an error.
     */
    async begin(request: object, email: string): Promise<void> {
      begun.set(request, { email, writes: await repo.writesByEmail(email) });
    },

    /**
     * After Better Auth has answered, a success or a failure alike: the same read either way,
     * waiting for a password write in flight. A failure here is not thrown, since a session may
     * already exist: it is `unreadable`, refused.
     */
    async settle(request: object): Promise<PasswordWriteCheck> {
      const start = begun.get(request);
      if (start === undefined) return { kind: "not_begun" };
      begun.delete(request);
      try {
        const now = await repo.committedWritesByEmail(start.email);
        return sameWrites(start.writes, now) ? { kind: "unchanged" } : { kind: "written" };
      } catch (error) {
        return { kind: "unreadable", sqlState: sqlStateOf(error) };
      }
    },
  };
}

export type SignInRaceCheck = ReturnType<typeof signInRaceCheck>;
