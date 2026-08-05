import type { AdopterId, AnimalId, SwipeDirection } from "@opika/domain";
import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { adopters } from "./adopters.js";
import { animals } from "./animals.js";

export const swipes = pgTable(
  "swipes",
  {
    adopterId: text("adopter_id")
      .notNull()
      .references(() => adopters.id)
      .$type<AdopterId>(),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id)
      .$type<AnimalId>(),
    direction: text({ enum: ["pass", "interested"] })
      .notNull()
      .$type<SwipeDirection>(),
    swipedAt: timestamp("swiped_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.adopterId, t.animalId] }),
    index("swipes_adopter_direction_idx").on(t.adopterId, t.direction, t.swipedAt),
  ],
);
