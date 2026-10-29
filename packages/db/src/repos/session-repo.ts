import type { AdopterId } from "@opika/domain";
import { and, count, eq, inArray, lt, or } from "drizzle-orm";
import type { Database } from "../client";
import { sessions } from "../schema/sessions";

export type SessionRow = {
  tokenHash: string;
  adopterId: AdopterId;
  createdAt: Date;
  lastSeenAt: Date;
};

/**
 * Decision 13's two limits on an anonymous session, in seconds (the cookie's Max-Age is the
 * absolute one). Here, beside the clean-up that deletes past them, and read by
 * `validateSession` (`apps/web/src/api/session/manager.ts`), so the rule that refuses a session
 * and the rule that deletes it are one set of numbers.
 */
export type AdopterSessionPolicy = {
  absoluteExpirySeconds: number;
  idleExpirySeconds: number;
};

const DAY_SECONDS = 24 * 3600;

export const ADOPTER_SESSION_POLICY: AdopterSessionPolicy = {
  absoluteExpirySeconds: 30 * DAY_SECONDS,
  idleExpirySeconds: 7 * DAY_SECONDS,
};

/**
 * A session created before `createdBefore`, or last seen before `lastSeenBefore`, has lapsed.
 * Strictly before: a session exactly at a limit is still live.
 */
export function adopterSessionCutoffs(
  now: Date,
  policy: AdopterSessionPolicy = ADOPTER_SESSION_POLICY,
): { createdBefore: Date; lastSeenBefore: Date } {
  return {
    createdBefore: new Date(now.getTime() - policy.absoluteExpirySeconds * 1000),
    lastSeenBefore: new Date(now.getTime() - policy.idleExpirySeconds * 1000),
  };
}

/** Which limit a session is past at `now`, if any. The SQL in `deleteLapsed` is the same test. */
export function adopterSessionLapse(
  row: Pick<SessionRow, "createdAt" | "lastSeenAt">,
  now: Date,
  policy: AdopterSessionPolicy = ADOPTER_SESSION_POLICY,
): "absolute" | "idle" | null {
  const { createdBefore, lastSeenBefore } = adopterSessionCutoffs(now, policy);
  if (row.createdAt.getTime() < createdBefore.getTime()) return "absolute";
  if (row.lastSeenAt.getTime() < lastSeenBefore.getTime()) return "idle";
  return null;
}

/** Rows one clean-up run deletes at most per table, so a backlog goes over several runs, never in one long statement. */
export const ADOPTER_CLEANUP_BATCH = 5000;

export function sessionRepo(db: Database) {
  return {
    async findByHash(tokenHash: string): Promise<SessionRow | null> {
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      return rows[0] ?? null;
    },

    async insert(session: SessionRow): Promise<void> {
      await db.insert(sessions).values(session);
    },

    async touchLastSeen(tokenHash: string, now: Date): Promise<void> {
      await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, tokenHash));
    },

    async deleteByHash(tokenHash: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    /**
     * Deletes up to `limit` sessions past either limit at `now` (audit F6): `validateSession`
     * deletes one only when its cookie comes back, which may be never. The lapse test sits on
     * the DELETE as well as in the batch's subquery, so a session a request touches while this
     * runs is re-checked on its new `last_seen_at` and kept.
     */
    async deleteLapsed(now: Date, limit: number = ADOPTER_CLEANUP_BATCH): Promise<number> {
      const { createdBefore, lastSeenBefore } = adopterSessionCutoffs(now);
      const lapsed = or(
        lt(sessions.createdAt, createdBefore),
        lt(sessions.lastSeenAt, lastSeenBefore),
      );
      const batch = db
        .select({ tokenHash: sessions.tokenHash })
        .from(sessions)
        .where(lapsed)
        .limit(limit);
      const deleted = db.$with("lapsed_sessions").as(
        db
          .delete(sessions)
          .where(and(inArray(sessions.tokenHash, batch), lapsed))
          .returning({ tokenHash: sessions.tokenHash }),
      );
      const [row] = await db.with(deleted).select({ count: count() }).from(deleted);
      return row?.count ?? 0;
    },
  };
}
