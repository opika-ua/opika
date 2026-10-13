import type { ShelterHistoryEntry, ShelterHistoryKind, ShelterId } from "@opika/domain";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "./helpers";
import { shelters } from "./shelters";

/**
 * A shelter's append-only history (`ShelterHistoryEntry`, KABINET N14/N23).
 * The operator reads it; the shelter never does.
 *
 * Five columns, pinned by an exact-field test (HS-Q6, Oleksii): the shelter,
 * when, which kind, the entry, and its id. **No adopter, reveal or swipe data,
 * ever.** This table is one join away from `reveals.shelter_id`, which is
 * exactly how commitment #2 ("a shelter is never told someone looked") would
 * break by accident.
 *
 * Written only in the same statement as the change it records
 * (`WITH upd AS (UPDATE … RETURNING …) INSERT …`, proposal §3), so a lost
 * compare-and-set leaves no history row behind.
 */
export const shelterHistory = pgTable(
  "shelter_history",
  {
    id: text().primaryKey(),
    shelterId: text("shelter_id")
      .notNull()
      .references(() => shelters.id)
      .$type<ShelterId>(),
    kind: text("kind").notNull().$type<ShelterHistoryKind>(),
    /** `historyEntryAt(entry)`, denormalised so the newest-first list can seek on an index. */
    at: timestamp("at", { withTimezone: true }).notNull(),
    entry: jsonb<ShelterHistoryEntry>("entry").notNull(),
  },
  (t) => [index("shelter_history_shelter_at_idx").on(t.shelterId, t.at.desc(), t.id.desc())],
);
