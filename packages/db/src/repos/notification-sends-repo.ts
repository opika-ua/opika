import type { ShelterId } from "@opika/domain";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { notificationSends } from "../schema/notification-sends";

export type NotificationSendRow = typeof notificationSends.$inferSelect;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Mails still worth retrying: a failed send younger than this. */
export const RETRY_WINDOW_HOURS = 48;
/** The first send plus one retry. */
export const MAX_SEND_ATTEMPTS = 2;
export const SEND_LOG_RETENTION_DAYS = 90;

/**
 * The send log behind notification emails (`notificationSends`): claim a dedup key, send only
 * if the claim won, then mark the outcome. Builder queries only, so the result shape is the
 * same on `postgres-js` and `neon-http`. `now` is always a parameter.
 */
export function notificationSendsRepo(db: Database) {
  return {
    /**
     * True only for the caller whose insert created the row; a second claim of the same key,
     * concurrent or later, gets false and must not send.
     */
    async claim(
      now: Date,
      claim: {
        dedupKey: string;
        kind: string;
        shelterId: ShelterId | null;
        recipientUserId: string | null;
      },
    ): Promise<boolean> {
      const rows = await db
        .insert(notificationSends)
        .values({ ...claim, status: "claimed", attempts: 1, createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: notificationSends.dedupKey })
        .returning({ dedupKey: notificationSends.dedupKey });
      return rows.length === 1;
    },

    /** Records the outcome of a claimed send; only a `claimed` row moves, so `sent` never regresses. */
    async mark(now: Date, dedupKey: string, status: "sent" | "failed"): Promise<boolean> {
      const rows = await db
        .update(notificationSends)
        .set({ status, updatedAt: now })
        .where(
          and(eq(notificationSends.dedupKey, dedupKey), eq(notificationSends.status, "claimed")),
        )
        .returning({ dedupKey: notificationSends.dedupKey });
      return rows.length === 1;
    },

    /** Failed sends created within the window that have attempts left, oldest first. */
    async retryable(
      now: Date,
      { sinceHours = RETRY_WINDOW_HOURS, maxAttempts = MAX_SEND_ATTEMPTS } = {},
    ): Promise<NotificationSendRow[]> {
      return db
        .select()
        .from(notificationSends)
        .where(
          and(
            eq(notificationSends.status, "failed"),
            gte(notificationSends.createdAt, new Date(now.getTime() - sinceHours * HOUR_MS)),
            lt(notificationSends.attempts, maxAttempts),
          ),
        )
        .orderBy(notificationSends.createdAt);
    },

    /**
     * Takes a failed row back for one more try, atomically: of two crons racing on the same
     * row only one gets true, and the attempt is counted before the send, not after.
     */
    async reclaim(now: Date, dedupKey: string, maxAttempts = MAX_SEND_ATTEMPTS): Promise<boolean> {
      const rows = await db
        .update(notificationSends)
        .set({
          status: "claimed",
          attempts: sql`${notificationSends.attempts} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(notificationSends.dedupKey, dedupKey),
            eq(notificationSends.status, "failed"),
            lt(notificationSends.attempts, maxAttempts),
          ),
        )
        .returning({ dedupKey: notificationSends.dedupKey });
      return rows.length === 1;
    },

    /**
     * How many sends of these kinds were claimed at or after `since`: the day's tally the event
     * cap reads. Every claimed row counts, sent or failed, because each one reached the provider.
     */
    async countCreatedSince(since: Date, kinds: readonly string[]): Promise<number> {
      if (kinds.length === 0) return 0;
      const rows = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(notificationSends)
        .where(
          and(gte(notificationSends.createdAt, since), inArray(notificationSends.kind, [...kinds])),
        );
      return rows[0]?.n ?? 0;
    },

    /** Deletes rows created strictly more than `days` ago; returns how many went. */
    async purgeOlderThan(now: Date, days = SEND_LOG_RETENTION_DAYS): Promise<number> {
      const rows = await db
        .delete(notificationSends)
        .where(lt(notificationSends.createdAt, new Date(now.getTime() - days * DAY_MS)))
        .returning({ dedupKey: notificationSends.dedupKey });
      return rows.length;
    },
  };
}
