import type { ShelterId } from "@opika/domain";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { supportSessions } from "../schema/auth";

/** KABINET S5 / RG-Q4: a support view lasts while it is used, and ends after 30 idle minutes. */
export const SUPPORT_IDLE_MS = 30 * 60 * 1000;

/**
 * The operator's read-only view of one shelter's kabinet (RG-Q4). Rows are
 * never deleted (RS-Q0): each is the record that a view happened, when, of
 * whom, and how it ended. Only the token's hash is stored.
 */
export function kabinetSupportRepo(db: Database) {
  return {
    /**
     * Starts a view. Any view the operator still has open ends as `replaced`
     * in the same statement, so an operator is never in two shelters at once.
     */
    async enter(input: {
      id: string;
      operatorUserId: string;
      shelterId: ShelterId;
      tokenHash: string;
      now: Date;
    }): Promise<void> {
      const replaced = db.$with("replaced").as(
        db
          .update(supportSessions)
          .set({ endedAt: input.now, endReason: "replaced" })
          .where(
            and(
              eq(supportSessions.operatorUserId, input.operatorUserId),
              isNull(supportSessions.endedAt),
            ),
          )
          .returning({ id: supportSessions.id }),
      );
      await db.with(replaced).insert(supportSessions).values({
        id: input.id,
        operatorUserId: input.operatorUserId,
        shelterId: input.shelterId,
        tokenHash: input.tokenHash,
        startedAt: input.now,
        lastSeenAt: input.now,
      });
    },

    /**
     * The shelter an open, recently used view points at, touching it so it
     * stays alive; or null. A view idle past the limit is closed as `idle`
     * at the moment it actually expired, not when someone noticed. Bound to
     * the operator: a token copied to another account resolves to nothing.
     */
    async touch(input: {
      tokenHash: string;
      operatorUserId: string;
      now: Date;
    }): Promise<ShelterId | null> {
      const freshAfter = new Date(input.now.getTime() - SUPPORT_IDLE_MS);
      const mine = and(
        eq(supportSessions.tokenHash, input.tokenHash),
        eq(supportSessions.operatorUserId, input.operatorUserId),
        isNull(supportSessions.endedAt),
      );
      const [alive] = await db
        .update(supportSessions)
        .set({ lastSeenAt: input.now })
        .where(and(mine, gt(supportSessions.lastSeenAt, freshAfter)))
        .returning({ shelterId: supportSessions.shelterId });
      if (alive !== undefined) return alive.shelterId as ShelterId;
      await db
        .update(supportSessions)
        .set({
          endedAt: sql`${supportSessions.lastSeenAt} + make_interval(secs => ${SUPPORT_IDLE_MS / 1000})`,
          endReason: "idle",
        })
        .where(and(mine, lte(supportSessions.lastSeenAt, freshAfter)));
      return null;
    },

    /** The operator leaves (S5 «Вийти з режиму»). False when there was no open view to leave. */
    async exit(input: { tokenHash: string; operatorUserId: string; now: Date }): Promise<boolean> {
      const ended = await db
        .update(supportSessions)
        .set({ endedAt: input.now, endReason: "exited" })
        .where(
          and(
            eq(supportSessions.tokenHash, input.tokenHash),
            eq(supportSessions.operatorUserId, input.operatorUserId),
            isNull(supportSessions.endedAt),
          ),
        )
        .returning({ id: supportSessions.id });
      return ended.length === 1;
    },
  };
}
