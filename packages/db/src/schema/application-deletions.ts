import type { ShelterDeletionReason } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One line per deleted application (D8) or operator-removed shelter (0032): it outlives the
 * shelter it names, so no foreign key. The shelter id is a random uuid; nothing here identifies a
 * person beyond the operator's own account id, set only on `operator_removed`.
 */
export const applicationDeletions = pgTable(
  "application_deletions",
  {
    id: text().primaryKey(),
    shelterId: text("shelter_id").notNull(),
    reason: text("reason").notNull().$type<ShelterDeletionReason>(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    /** Who removed it: no foreign key, so the line outlives any account change. */
    operatorUserId: text("operator_user_id"),
  },
  (t) => [
    check(
      "application_deletions_reason_check",
      sql`${t.reason} IN ('abandoned', 'rejected_expired', 'not_me', 'operator_removed')`,
    ),
    check(
      "application_deletions_operator_check",
      sql`(${t.reason} = 'operator_removed') = (${t.operatorUserId} IS NOT NULL)`,
    ),
  ],
);
