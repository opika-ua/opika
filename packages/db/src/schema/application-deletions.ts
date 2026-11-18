import type { ApplicationDeletionReason } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One line per deleted application (D8): it outlives the shelter it names, so no foreign key.
 * The shelter id is a random uuid; nothing here identifies a person.
 */
export const applicationDeletions = pgTable(
  "application_deletions",
  {
    id: text().primaryKey(),
    shelterId: text("shelter_id").notNull(),
    reason: text("reason").notNull().$type<ApplicationDeletionReason>(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "application_deletions_reason_check",
      sql`${t.reason} IN ('abandoned', 'rejected_expired', 'not_me')`,
    ),
  ],
);
