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
 * neon-http (standing constraints, R1).
 */
export function authPasswordWriteRepo(db: Database) {
  return {
    /**
     * Every credential of the user with this address, by id: none for an address nobody has or
     * for a user with no password yet. One statement whatever the address, so it costs every
     * sign-in the same (§5). The address is trimmed and lower-cased, as every other lookup by
     * address in the kabinet (`kabinetActorRepo`) and as Better Auth stores it.
     */
    async writesByEmail(email: string): Promise<PasswordWrite[]> {
      return db
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
    },
  };
}
