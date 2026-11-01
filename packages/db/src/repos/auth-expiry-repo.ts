import { and, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { authSession, authVerification, superAdmins } from "../schema/auth";

export type AuthExpiryCounts = { verifications: number; sessions: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a kabinet session lives, by who holds it. Here, beside the clean-up
 * that deletes past them, and read by the kabinet's own `hooks.before` and
 * `kabinetSessionUserIdOf` (`apps/web/src/kabinet/session-lapse.ts`), so the
 * rule that ends a session and the rule that deletes it are one set of numbers,
 * and the /pro sentence on session length (`about.data`, tied to these by
 * `apps/web/src/kabinet/session-claim.test.ts`) has one source.
 *
 * - **Shelter admins: 30 days since the last visit, 90 days at most** (F-B9;
 *   Oleksii, 2026-10-19, `docs/shelter-passwords.md` §9 answer 6, verbatim:
 *   "Confirmed: 30-day rolling / 90-day cap for shelter admins ships with
 *   passwords."). Every user who doesn't hold an active super_admin grant gets
 *   these, a roleless invitee included.
 * - **The operator: 7 days since the last visit, 30 days at most**, the
 *   numbers every session had before (HS-Q8). §9 answer 3, verbatim: "(a): the
 *   operator keeps 7 days idle / 30-day cap, enforced by role. The operator
 *   never has a password." "The operator" is whoever holds an active
 *   `super_admins` grant, the same rule as `kabinetActorRepo.roleOf`.
 *
 * "Since the last visit" is measured from `auth_session.updated_at`, which
 * Better Auth moves when it refreshes a session. The kabinet's instance
 * refreshes it on every kabinet request (`updateAge` 0:
 * `KABINET_SESSION.refreshSeconds` in `apps/web/src/kabinet/auth.ts`, PW1-Q2),
 * so a session lapses exactly its idle limit after its last use. The
 * operator's limits are the shorter in both dimensions; `session-lapse.ts`
 * relies on it, and its test pins it.
 */
export const KABINET_SESSION_LIMITS = {
  shelterAdmin: { idleMs: 30 * DAY_MS, absoluteMs: 90 * DAY_MS },
  operator: { idleMs: 7 * DAY_MS, absoluteMs: 30 * DAY_MS },
} as const;

/**
 * Deletes the Better Auth rows that have lost force (inbox KH-Q9; Oleksii,
 * 2026-10-14, relayed, verbatim: "One statement: delete auth_verification
 * rows past expiry, and auth_session rows past expires_at."). The cron, every
 * 6 hours (`apps/web/src/kabinet/auth-cleanup.ts`), is what the /pro sentence
 * (records of sign-ins that have lost force are deleted within a day, KH-Q12)
 * relies on: Better Auth on its own deletes an expired session only when that
 * session's cookie comes back, which may be never.
 *
 * **Past expiry means `expires_at < now`, strictly**, matching Better Auth
 * 1.7.14: `getSession` rejects a session when `expiresAt < new Date()`,
 * `consumeVerificationValue` rejects a verification when
 * `expiresAt < new Date()`, and its own verification sweep deletes
 * `expiresAt lt now`. A row expiring at exactly `now` is still live to Better
 * Auth, so it stays.
 *
 * **And a session past its holder's limits, whatever its `expires_at`**
 * (Oleksii, 2026-10-14, inbox EM-Q11, verbatim: "The cleanup also deletes
 * sessions older than the 30-day absolute cap. Same statement plus one
 * condition."; since the passwords build the limits are by role,
 * `KABINET_SESSION_LIMITS`). Better Auth's own `expires_at` is set to the
 * longest any session may live (the shelter admin's 90 days), because the
 * browser's cookie lives as long as that setting from sign-in and the
 * kabinet's server-side session reads never renew it; so the limits are ours.
 * Past the shelter admin's idle limit or cap, a session is dead for anyone;
 * past the operator's shorter ones, it is dead when its user holds an active
 * super_admin grant. The kabinet treats such a session as dead (`hooks.before`
 * deletes it when presented, `kabinetSessionUserIdOf` refuses it), so it has
 * lost force and the /pro sentence («…протягом доби») covers it. Past a limit
 * means `< now - limit`, strictly, the same comparison as the hook's
 * `now - … > limit`: a session exactly at a limit is still accepted there, so
 * it stays here.
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
      const before = (ms: number) => new Date(now.getTime() - ms);
      const { shelterAdmin, operator } = KABINET_SESSION_LIMITS;
      const operators = db
        .select({ userId: superAdmins.userId })
        .from(superAdmins)
        .where(isNull(superAdmins.revokedAt));
      const sessions = db.$with("expired_sessions").as(
        db
          .delete(authSession)
          .where(
            or(
              lt(authSession.expiresAt, now),
              lt(authSession.createdAt, before(shelterAdmin.absoluteMs)),
              lt(authSession.updatedAt, before(shelterAdmin.idleMs)),
              and(
                inArray(authSession.userId, operators),
                or(
                  lt(authSession.createdAt, before(operator.absoluteMs)),
                  lt(authSession.updatedAt, before(operator.idleMs)),
                ),
              ),
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
