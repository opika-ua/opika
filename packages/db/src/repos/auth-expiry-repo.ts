import { lt, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authSession, authVerification } from "../schema/auth";

export type AuthExpiryCounts = { verifications: number; sessions: number };

/**
 * The kabinet session's absolute cap, 30 days (HS-Q8, mirroring decision
 * #13). Here, beside the clean-up that deletes past it, and read by the
 * kabinet's own `hooks.before` and `kabinetIdentityOf`
 * (`apps/web/src/kabinet/auth.ts`, `KABINET_SESSION.absoluteMs`), so the rule
 * that ends a session and the rule that deletes it are one number.
 */
export const KABINET_SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Deletes the Better Auth rows that have lost force (inbox KH-Q9; Oleksii,
 * 2026-10-14, relayed, verbatim: "One statement: delete auth_verification
 * rows past expiry, and auth_session rows past expires_at."). The daily cron
 * (`apps/web/src/kabinet/auth-cleanup.ts`) is what the /pro sentence (row 90:
 * records of sign-ins that have lost force are deleted within two days)
 * relies on: Better Auth on its own deletes an expired session only when that
 * session's cookie comes back, which may be never.
 *
 * **Past expiry means `expires_at < now`, strictly**, matching Better Auth
 * 1.6.33: `getSession` rejects a session when `expiresAt < new Date()`,
 * `consumeVerificationValue` rejects a verification when
 * `expiresAt < new Date()`, and its own verification sweep deletes
 * `expiresAt lt now`. A row expiring at exactly `now` is still live to Better
 * Auth, so it stays.
 *
 * **And a session past the 30-day absolute cap, whatever its `expires_at`**
 * (Oleksii, 2026-10-14, inbox EM-Q11, verbatim: "The cleanup also deletes
 * sessions older than the 30-day absolute cap. Same statement plus one
 * condition."). Better Auth would still accept such a session (its sliding
 * expiry can be up to 7 days ahead), but the kabinet treats it as dead
 * (`hooks.before` deletes it when presented, `kabinetIdentityOf` refuses it),
 * so it has lost force and the /pro sentence covers it. Until this
 * condition it could survive up to about 8 days after losing force. Past the
 * cap means `created_at < now - cap`, strictly, the same comparison as the
 * hook's `now - created_at > cap`: a session exactly at the cap is still
 * accepted there, so it stays here.
 *
 * One statement (two data-modifying CTEs; Postgres runs both to completion
 * whether or not the outer query reads them), through Drizzle's query
 * builder, so the result shape is the same on `postgres-js` and
 * `neon-http` (no raw `.execute()`, standing constraint).
 */
export function authExpiryRepo(db: Database) {
  return {
    async deleteExpired(now: Date): Promise<AuthExpiryCounts> {
      const verifications = db
        .$with("expired_verifications")
        .as(
          db
            .delete(authVerification)
            .where(lt(authVerification.expiresAt, now))
            .returning({ id: authVerification.id }),
        );
      const sessions = db.$with("expired_sessions").as(
        db
          .delete(authSession)
          .where(
            or(
              lt(authSession.expiresAt, now),
              lt(authSession.createdAt, new Date(now.getTime() - KABINET_SESSION_ABSOLUTE_MS)),
            ),
          )
          .returning({ id: authSession.id }),
      );
      const [row] = await db
        .with(verifications, sessions)
        .select({
          verifications: sql<number>`(SELECT count(*) FROM "expired_verifications")`.mapWith(
            Number,
          ),
          sessions: sql<number>`(SELECT count(*) FROM "expired_sessions")`.mapWith(Number),
        })
        .from(sql`(SELECT 1) AS one`);
      if (row === undefined) throw new Error("auth expiry delete returned no row");
      return row;
    },
  };
}
