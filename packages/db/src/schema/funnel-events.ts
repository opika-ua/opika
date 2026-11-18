import type { FunnelEventKind, ShelterId } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { shelters } from "./shelters";

/**
 * The operator's onboarding funnel (§8): one row per step a shelter reached, at most once each.
 * No personal data, no IP, no user agent. A deleted application leaves its rows with a null
 * shelter, so the 30-day counts survive the clean-up.
 */
export const funnelEvents = pgTable(
  "funnel_events",
  {
    id: text().primaryKey(),
    shelterId: text("shelter_id")
      .references(() => shelters.id, { onDelete: "set null" })
      .$type<ShelterId>(),
    kind: text("kind").notNull().$type<FunnelEventKind>(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "funnel_events_kind_check",
      sql`${t.kind} IN ('registered', 'email_confirmed', 'first_draft', 'approved', 'first_published')`,
    ),
    uniqueIndex("funnel_events_once_idx")
      .on(t.shelterId, t.kind)
      .where(sql`${t.shelterId} IS NOT NULL`),
    index("funnel_events_at_idx").on(t.at),
  ],
);
