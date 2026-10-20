import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authVerification } from "../schema/auth";

/**
 * What an identifier Better Auth stored hashed looks like: SHA-256, base64url,
 * no padding, so 43 characters of `A–Z a–z 0–9 - _` (Better Auth 1.6.33,
 * `db/verification-token-storage.mjs`, `defaultKeyHasher`). Written out here,
 * not imported from Better Auth, so an upgrade that changes the encoding fails
 * the storage-format pin in `apps/web/src/kabinet/password-flows.test.ts`
 * rather than silently matching nothing.
 */
const HASHED_IDENTIFIER = "^[A-Za-z0-9_-]{43}$";

/**
 * A shelter admin's reset links («Забули пароль?»), as Better Auth stores them
 * (PW1-F1). Each link is one `auth_verification` row: `identifier` is SHA-256
 * (base64url) of `reset-password:<token>` (the kabinet's `storeIdentifier`
 * override, `apps/web/src/kabinet/auth.ts`), so neither the token nor the
 * prefix is in the row, and `value` is the user's id (Better Auth 1.6.33,
 * `api/routes/password.mjs`, `requestPasswordReset`).
 *
 * **Why both conditions pick a reset link and nothing else.** In this config
 * Better Auth writes `auth_verification` from four places, and only the reset
 * has both a hashed identifier and a user id for a value:
 * - a magic link (`plugins/magic-link/index.mjs`): a hashed identifier
 *   (`storeToken: "hashed"`), but the value is JSON (`{"email":…}`), never a
 *   user id;
 * - a delete-account confirmation (`api/routes/update-user.mjs`): the value is
 *   a user id, but the identifier is stored plain (`delete-account-<token>`,
 *   47 characters), and the kabinet never turns `user.deleteUser` on anyway;
 * - OAuth state (`state.mjs`): a plain identifier and a JSON value, and the
 *   kabinet has no social sign-in.
 * Invitations live in `auth_invitation`, not here. Another user's links carry
 * another user's id. `auth.test.ts` pins the plugin list to magic-link and
 * organization, so a new writer can't arrive unseen.
 *
 * Expired links of the user go too: they are already dead, and the clean-up
 * would delete them within six hours (`authExpiryRepo`).
 *
 * Drizzle's query builder, no raw `.execute()`, and nothing read back: the
 * two drivers return different result shapes (`postgres-js` and `neon-http`,
 * standing constraint), and nobody needs a count.
 */
export function authResetLinkRepo(db: Database) {
  return {
    /**
     * Deletes every reset link this user still holds. Called right after
     * Better Auth writes a new password (a reset or a change): the link a
     * reset used is already consumed by then.
     */
    async deleteUnused(userId: string): Promise<void> {
      await db
        .delete(authVerification)
        .where(
          and(
            eq(authVerification.value, userId),
            sql`${authVerification.identifier} ~ ${HASHED_IDENTIFIER}`,
          ),
        );
    },
  };
}
