import { randomUUID } from "node:crypto";
import { FUNNEL_EVENT_KINDS, type FunnelEventKind, type ShelterId } from "@opika/domain";
import { count, gte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { funnelEvents } from "../schema/funnel-events";

export type FunnelRecordOutcome = "recorded" | "already_recorded";

/**
 * The onboarding funnel (§8). Each step counts once per shelter: a second `record` of the same
 * step (a retried action, a second draft) is `already_recorded` and writes nothing. Builder
 * queries only, so `postgres-js` and `neon-http` answer alike.
 */
export function funnelRepo(db: Database) {
  return {
    async record(
      kind: FunnelEventKind,
      shelterId: ShelterId,
      now: Date,
    ): Promise<FunnelRecordOutcome> {
      const rows = await db
        .insert(funnelEvents)
        .values({ id: randomUUID(), shelterId, kind, at: now })
        .onConflictDoNothing({
          target: [funnelEvents.shelterId, funnelEvents.kind],
          where: sql`${funnelEvents.shelterId} IS NOT NULL`,
        })
        .returning({ id: funnelEvents.id });
      return rows.length === 1 ? "recorded" : "already_recorded";
    },

    /** Every step's count from `since` on, deleted applications included; a missing step is 0. */
    async countsSince(since: Date): Promise<Record<FunnelEventKind, number>> {
      const rows = await db
        .select({ kind: funnelEvents.kind, n: count() })
        .from(funnelEvents)
        .where(gte(funnelEvents.at, since))
        .groupBy(funnelEvents.kind);
      const counts = Object.fromEntries(FUNNEL_EVENT_KINDS.map((kind) => [kind, 0])) as Record<
        FunnelEventKind,
        number
      >;
      for (const row of rows) counts[row.kind] = Number(row.n);
      return counts;
    },
  };
}
