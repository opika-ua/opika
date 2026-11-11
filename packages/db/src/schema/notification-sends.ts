import type { ShelterId } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { authUser } from "./auth";
import { shelters } from "./shelters";

export const NOTIFICATION_SEND_STATUSES = ["claimed", "sent", "failed"] as const;
export type NotificationSendStatus = (typeof NOTIFICATION_SEND_STATUSES)[number];

/**
 * One row per notification email, claimed before it is sent: whoever inserts the
 * `dedup_key` first sends, everyone else sees a conflict and stays quiet (a cron event
 * delivered twice, two writers racing). Holds no address and no text: the recipient is a
 * user id, so the row is pseudonymous. The recipient column is nulled when that account is
 * erased, and the dedup key carries only an unsalted hash of the user id (`h:{historyId}:{hash}`,
 * `notify/dedup.ts`). The hash can be recomputed from an id that history still holds, so a row is
 * pseudonymous, not anonymous, until the 90-day purge by the 6-hourly auth clean-up
 * (`notificationSendsRepo`).
 *
 * `kind` is plain text, not a CHECK: a new mail kind is a code change, not a migration.
 * Both foreign keys SET NULL, so erasing a shelter or a user never needs to touch this table.
 */
export const notificationSends = pgTable(
  "notification_sends",
  {
    dedupKey: text("dedup_key").primaryKey(),
    kind: text("kind").notNull(),
    shelterId: text("shelter_id")
      .references(() => shelters.id, { onDelete: "set null" })
      .$type<ShelterId | null>(),
    recipientUserId: text("recipient_user_id").references(() => authUser.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().$type<NotificationSendStatus>(),
    attempts: integer("attempts").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("notification_sends_status_check", sql`${t.status} IN ('claimed', 'sent', 'failed')`),
    index("notification_sends_status_created_idx").on(t.status, t.createdAt),
  ],
);
