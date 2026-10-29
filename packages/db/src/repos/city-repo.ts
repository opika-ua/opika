import type { City, CityId } from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { cities } from "../schema/cities";
import { cityToRow, rowToCity } from "./mappers";

export function cityRepo(db: Database) {
  return {
    async findById(id: CityId): Promise<City | null> {
      const rows = await db.select().from(cities).where(eq(cities.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToCity(row) : null;
    },

    async listAll(): Promise<readonly City[]> {
      const rows = await db.select().from(cities);
      return rows.map(rowToCity);
    },

    async insert(city: City): Promise<void> {
      await db.insert(cities).values(cityToRow(city));
    },

    /**
     * Idempotent write for reference data that must survive a reseed: `cities` is never
     * truncated (the importer's rows and slug aliases live here), so the 8 seeded rows are
     * updated in place, keyed on `id`.
     */
    async upsertMany(cityList: readonly City[]): Promise<void> {
      if (cityList.length === 0) return;
      for (const city of cityList) {
        const row = cityToRow(city);
        const { id: _id, ...changes } = row;
        await db.insert(cities).values(row).onConflictDoUpdate({ target: cities.id, set: changes });
      }
    },

    async insertMany(cityList: readonly City[]): Promise<void> {
      if (cityList.length === 0) return;
      await db.insert(cities).values(cityList.map(cityToRow));
    },
  };
}
