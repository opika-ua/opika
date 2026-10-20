import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { authAccount, authUser } from "../schema/auth";
import { CREDENTIAL_PROVIDER_ID } from "./kabinet-actor-repo";

/**
 * One credential of a user, as its last password write left it (PW1-F6). Better Auth 1.6.33
 * moves both on every password write, and `apps/web/src/kabinet/password-flows.test.ts` pins
 * that against Better Auth itself:
 *
 * - `updatedAt`: its adapter stamps the account's `updatedAt` on every update (the account
 *   schema's `onUpdate`, applied by `updatePassword` on a reset and `updateAccount` on a
 *   change) and sets it on every create (`createAccount` for a first password, `linkAccount`
 *   for the server-only `setPassword`). In this config nothing but a password write updates a
 *   credential row: no social sign-in, and none of the account routes is forwarded.
 * - `hash`: scrypt with a fresh random salt each time, so even the same password written again
 *   is a different string. It closes what a stamp alone leaves open: two writes on two servers
 *   whose clocks happen to read the same millisecond.
 */
export type PasswordWrite = { accountId: string; updatedAt: Date; hash: string | null };

/**
 * What a password sign-in reads before Better Auth checks the password and again after it has
 * answered, to see whether a reset or a change wrote the password in between (PW1-F6,
 * `apps/web/src/kabinet/sign-in-race.ts`).
 *
 * Drizzle's query builder, no raw `.execute()`: the result shape is the same on postgres-js and
 * neon-http (standing constraints, R1). Each read is one statement whatever the address, so it
 * costs every sign-in the same (§5). The address is trimmed and lower-cased, as every other
 * lookup by address in the kabinet (`kabinetActorRepo`) and as Better Auth stores it.
 */
export function authPasswordWriteRepo(db: Database) {
  const credentialsOf = (email: string) =>
    db
      .select({
        accountId: authAccount.id,
        updatedAt: authAccount.updatedAt,
        hash: authAccount.password,
      })
      .from(authAccount)
      .innerJoin(authUser, eq(authUser.id, authAccount.userId))
      .where(
        and(
          eq(authUser.email, email.trim().toLowerCase()),
          eq(authAccount.providerId, CREDENTIAL_PROVIDER_ID),
        ),
      )
      .orderBy(asc(authAccount.id));

  return {
    /**
     * Every credential of the user with this address, by id, as the last committed write left
     * it: none for an address nobody has or a user with no password yet. A plain read, never
     * waiting: the "before" a sign-in compares with. A write it can't see yet (in flight, or
     * later) can only make the second read differ, which refuses.
     */
    async writesByEmail(email: string): Promise<PasswordWrite[]> {
      return credentialsOf(email);
    },

    /**
     * The same, but waiting for any password write still in flight on those rows, and then
     * reading what it committed: `FOR SHARE` on the credential rows (`auth_account` only).
     *
     * **Why the second read must wait.** A password write is one statement: Better Auth's
     * UPDATE, inside which PW1-F5's trigger has already deleted every session of the user, and
     * only then the commit. A plain read in the moment between the two still sees the old row
     * (each statement reads what was committed when it began), so a sign-in that inserted its
     * session just after the trigger's delete would find nothing changed and keep that session.
     * `FOR SHARE` can't take the row while the UPDATE holds it: it waits, and once the write
     * commits it reads the row as the write left it, so the sign-in sees the write and refuses.
     * A write that rolls back leaves the old row, and nothing to refuse.
     *
     * A first password is an INSERT (`createAccount`): there is no row to wait on, and nothing
     * to race either, since the user had no password the sign-in could have checked. The lock
     * lasts as long as the statement (neon-http runs each query in its own transaction, as
     * postgres-js does outside one), so it holds a concurrent write back by no more than this
     * read. It needs the UPDATE privilege on `auth_account`, which the app's role has (it is the
     * owner, and Better Auth writes there through it).
     */
    async committedWritesByEmail(email: string): Promise<PasswordWrite[]> {
      return credentialsOf(email).for("share", { of: authAccount });
    },
  };
}
