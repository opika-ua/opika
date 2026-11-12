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

    /**
     * Ends a claimed send as failed with every attempt spent, in one statement, so no sweep can
     * take it back between a mark and a second write. For a send that got no answer and may have
     * been delivered: it must never be resent.
     */
    async closeFailed(
      now: Date,
      dedupKey: string,
      maxAttempts = MAX_SEND_ATTEMPTS,
    ): Promise<boolean> {
      const rows = await db
        .update(notificationSends)
        .set({
          status: "failed",
          attempts: sql`greatest(${notificationSends.attempts}, ${maxAttempts})`,
          updatedAt: now,
        })
        .where(
          and(eq(notificationSends.dedupKey, dedupKey), eq(notificationSends.status, "claimed")),
        )
        .returning({ dedupKey: notificationSends.dedupKey });
      return rows.length === 1;
    },

    /**
     * Which of these keys already have a row, whatever its status: lets a batch tell a mail it
     * sent before from one it would send, without claiming anything.
     */
    async claimedKeys(dedupKeys: readonly string[]): Promise<Set<string>> {
      if (dedupKeys.length === 0) return new Set();
      const rows = await db
        .select({ dedupKey: notificationSends.dedupKey })
        .from(notificationSends)
        .where(inArray(notificationSends.dedupKey, [...dedupKeys]));
      return new Set(rows.map((row) => row.dedupKey));
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
     * How many sends of these kinds went out at or after `since`: the day's tally the event cap
     * reads. A first attempt counts on the day its row was created, a retry (attempts 2 or more)
     * on the day the row was last touched, so a row retried the day after it was created counts
     * once on each. Sent or failed, each one reached the provider. A closed row (attempts spent
     * without a retry) counts its spent attempt too: the tally errs on the side of the cap.
     */
    async countSendsSince(since: Date, kinds: readonly string[]): Promise<number> {
      if (kinds.length === 0) return 0;
      const sinceIso = since.toISOString();
      const rows = await db
        .select({
          n: sql<number>`(
            count(*) FILTER (WHERE ${notificationSends.createdAt} >= ${sinceIso}::timestamptz)
            + count(*) FILTER (WHERE ${notificationSends.attempts} >= 2
                AND ${notificationSends.updatedAt} >= ${sinceIso}::timestamptz)
          )`.mapWith(Number),
        })
        .from(notificationSends)
        .where(inArray(notificationSends.kind, [...kinds]));
      return rows[0]?.n ?? 0;
    },

    /**
     * The sends the two scheduled batches (the daily and the weekly cron) made at or after `since`,
     * the tally their one shared budget reads: a first attempt of a batch kind counts on the day
     * its row was created, and any retry (attempts 2 or more, of any kind, because the daily sweep
     * makes them) on the day it was made.
     */
    async countBatchSendsSince(since: Date, batchKinds: readonly string[]): Promise<number> {
      const sinceIso = since.toISOString();
      const rows = await db
        .select({
          n: sql<number>`(
            count(*) FILTER (WHERE ${notificationSends.createdAt} >= ${sinceIso}::timestamptz
                AND ${inArray(notificationSends.kind, [...batchKinds])})
            + count(*) FILTER (WHERE ${notificationSends.attempts} >= 2
                AND ${notificationSends.updatedAt} >= ${sinceIso}::timestamptz)
          )`.mapWith(Number),
        })
        .from(notificationSends);
      return rows[0]?.n ?? 0;
    },

    /**
     * When each of these shelters was last sent a mail of this kind (newest row), by shelter id;
     * a shelter never sent one is absent. The weekly run serves the longest-waiting first, so a
     * shelter its budget skipped one week leads the next.
     */
    async lastSentAtByShelter(
      kind: string,
      shelterIds: readonly ShelterId[],
    ): Promise<Map<string, Date>> {
      if (shelterIds.length === 0) return new Map();
      const rows = await db
        .select({
          shelterId: notificationSends.shelterId,
          last: sql<Date>`max(${notificationSends.createdAt})`.mapWith(notificationSends.createdAt),
        })
        .from(notificationSends)
        .where(
          and(
            eq(notificationSends.kind, kind),
            inArray(notificationSends.shelterId, [...shelterIds]),
          ),
        )
        .groupBy(notificationSends.shelterId);
      return new Map(
        rows.flatMap((row) => (row.shelterId === null ? [] : [[row.shelterId, row.last] as const])),
      );
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
