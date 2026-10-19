import { count, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authSession, authVerification } from "../schema/auth";

export type AuthRevokeCounts = { sessions: number; verifications: number };

/**
 * Every kabinet sign-in at once: all of `auth_session` (signed-in browsers) and
 * all of `auth_verification` (sign-in links not yet followed), and nothing else.
 * It is the required step after rotating `BETTER_AUTH_SECRET`, run by
 * `auth:revoke-all` (`../auth-revoke-all.ts`). Oleksii, 2026-10-18 (KH-Q12
 * rotation), verbatim: "after the redeploy, these two steps are REQUIRED (…):
 * DELETE FROM auth_session; DELETE FROM auth_verification;". Rotation alone
 * leaves the old session rows in place until the clean-up's expiry rule
 * reaches them, up to 7 days later, which /pro's «…протягом доби» doesn't allow.
 *
 * **Only these two tables.** Users, accounts, memberships, organizations,
 * invitations, super_admins and support_sessions all stay: a signed-out admin
 * signs in again as the same person, with the same access. Nothing references
 * either table, so nothing cascades. `invitation_created_users.first_session_at`
 * doesn't depend on these rows either: it records a first sign-in as a fact
 * of its own, precisely because session rows vanish on sign-out and expiry
 * (RS-Q0).
 *
 * **One statement**, two data-modifying CTEs, the same shape as
 * `authExpiryRepo.deleteExpired`: Postgres runs a statement as its own
 * transaction, so both tables empty together or neither does. That holds on
 * `neon-http`, which has no interactive transactions, as well as on
 * `postgres-js`. Drizzle's query builder only, no raw `.execute()`, so the
 * result shape is the same on both drivers (standing constraint).
 *
 * **Not exported from `./index`**, on purpose: no request path should ever
 * hold a function that signs everyone out. Only the CLI and the Neon smoke
 * import it, by path (`test/auth-revoke-all.test.ts` pins that).
 */
export function authRevokeRepo(db: Database) {
  return {
    /** The dry run's numbers: how many rows each table holds now. */
    async countAll(): Promise<AuthRevokeCounts> {
      const [sessions] = await db.select({ n: count() }).from(authSession);
      const [verifications] = await db.select({ n: count() }).from(authVerification);
      return { sessions: sessions?.n ?? 0, verifications: verifications?.n ?? 0 };
    },

    /** Deletes every row of both tables in one statement, and returns how many went. */
    async deleteAll(): Promise<AuthRevokeCounts> {
      const sessions = db
        .$with("revoked_sessions")
        .as(db.delete(authSession).returning({ id: authSession.id }));
      const verifications = db
        .$with("revoked_verifications")
        .as(db.delete(authVerification).returning({ id: authVerification.id }));
      const [row] = await db
        .with(sessions, verifications)
        .select({
          sessions: sql<number>`(SELECT count(*) FROM "revoked_sessions")`.mapWith(Number),
          verifications: sql<number>`(SELECT count(*) FROM "revoked_verifications")`.mapWith(
            Number,
          ),
        })
        .from(sql`(SELECT 1) AS one`);
      if (row === undefined) throw new Error("auth revoke-all delete returned no row");
      return row;
    },
  };
}
