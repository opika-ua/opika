import type { Shelter, ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { shelters } from "../schema/shelters.js";
import { rowToShelter, shelterToRow } from "./mappers.js";

export function shelterRepo(db: Database) {
  return {
    async findById(id: ShelterId): Promise<Shelter | null> {
      const rows = await db.select().from(shelters).where(eq(shelters.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToShelter(row) : null;
    },

    async insert(shelter: Shelter): Promise<void> {
      await db.insert(shelters).values(shelterToRow(shelter));
    },

    async update(shelter: Shelter): Promise<void> {
      await db.update(shelters).set(shelterToRow(shelter)).where(eq(shelters.id, shelter.id));
    },
  };
}
