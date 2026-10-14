import { lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authSession, authVerification } from "../schema/auth";

export type AuthExpiryCounts = { verifications: number; sessions: number };

/**
 * Deletes the Better Auth rows Better Auth itself already treats as dead
 * (inbox KH-Q9; Oleksii, 2026-10-14, relayed, verbatim: "One statement: delete
 * auth_verification rows past expiry, and auth_session rows past expires_at."
 * and "Only rows Better Auth itself treats as dead."). The daily cron
 * (`apps/web/src/kabinet/auth-cleanup.ts`) is what the provisional /pro
 * sentence (KH-C1: expired sign-in records deleted within two days) relies on:
 * Better Auth on its own deletes an expired session only when that session's
 * cookie comes back, which may be never.
 *
 * **Dead means `expires_at < now`, strictly**, matching Better Auth 1.6.33:
 * `getSession` rejects a session when `expiresAt < new Date()`,
 * `consumeVerificationValue` rejects a verification when
 * `expiresAt < new Date()`, and its own verification sweep deletes
 * `expiresAt lt now`. A row expiring at exactly `now` is still live to Better
 * Auth, so it stays.
 *
 * Not dead, so kept: a session past the kabinet's 30-day absolute cap whose
 * sliding `expires_at` is still ahead. Better Auth would still accept it; the
 * kabinet's own `hooks.before` deletes it the next time it's presented, and
 * if it never is, its `expires_at` passes within 7 days and this deletes it.
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
      const sessions = db
        .$with("expired_sessions")
        .as(
          db
            .delete(authSession)
            .where(lt(authSession.expiresAt, now))
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
