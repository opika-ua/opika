import type {
  AdopterId,
  AnimalId,
  AnimalRevealSnapshot,
  RevealId,
  ShelterContactSnapshot,
  ShelterId,
} from "@opika/domain";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { adopters } from "./adopters";
import { animals } from "./animals";
import { jsonb } from "./helpers";
import { shelters } from "./shelters";

export const reveals = pgTable(
  "reveals",
  {
    id: text().primaryKey().$type<RevealId>(),
    adopterId: text("adopter_id")
      .notNull()
      .references(() => adopters.id)
      .$type<AdopterId>(),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id)
      .$type<AnimalId>(),
    shelterId: text("shelter_id")
      .notNull()
      .references(() => shelters.id)
      .$type<ShelterId>(),
    revealedAt: timestamp("revealed_at", { withTimezone: true }).notNull(),
    shelterSnapshot: jsonb<ShelterContactSnapshot>("shelter_snapshot").notNull(),
    animalSnapshot: jsonb<AnimalRevealSnapshot>("animal_snapshot").notNull(),
  },
  (t) => [
    index("reveals_adopter_id_idx").on(t.adopterId, t.revealedAt),
    index("reveals_shelter_id_idx").on(t.shelterId),
    index("reveals_adopter_animal_idx").on(t.adopterId, t.animalId),
  ],
);
