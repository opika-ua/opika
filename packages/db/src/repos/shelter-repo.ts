import type { Shelter, ShelterId } from "@opika/domain";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { shelters } from "../schema/shelters";
import { rowToShelter, shelterToRow } from "./mappers";

export function shelterRepo(db: Database) {
  return {
    async findById(id: ShelterId): Promise<Shelter | null> {
      const rows = await db.select().from(shelters).where(eq(shelters.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToShelter(row) : null;
    },

    /**
     * Fetch multiple shelters in a single query.
     *
     * Used by the feed handler to avoid N+1: one query for all shelters
     * on the page, instead of one per card.
     */
    async findByIds(ids: readonly ShelterId[]): Promise<readonly Shelter[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(shelters)
        .where(inArray(shelters.id, [...ids]));
      return rows.map(rowToShelter);
    },

    async insert(shelter: Shelter): Promise<void> {
      await db.insert(shelters).values(shelterToRow(shelter));
    },

    // Deliberately no `update`. A whole-row write here would not bump
    // `version`, so it could overwrite a field between a kabinet read and
    // its compare-and-set write without the CAS noticing, and leave no
    // history row. Changes to an existing shelter go through
    // `kabinetShelterRepo.applyAudited*`; `repos.test.ts` asserts the absence.
  };
}
