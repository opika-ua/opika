import type { City, CityId } from "@opika/domain";
import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { cities } from "../schema/cities";
import { pickableCity } from "./city-search-repo";
import { cityToRow, rowToCity } from "./mappers";

export function cityRepo(db: Database) {
  return {
    async findById(id: CityId): Promise<City | null> {
      const rows = await db.select().from(cities).where(eq(cities.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToCity(row) : null;
    },

    /** `findById`, but only a settlement the picker may offer: never Crimea, Sevastopol or a retired one. */
    async findPickableById(id: CityId): Promise<City | null> {
      const rows = await db
        .select()
        .from(cities)
        .where(and(eq(cities.id, id), pickableCity))
        .limit(1);
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
     * Inserts the cities that don't exist yet and leaves every existing row untouched, so a reseed
     * can never undo the importer's work: it renamed `brovary` to `brovary-kyivska`, gave it a
     * code, a raion and a hromada, and parked the old slug in `city_slug_aliases`. An update here
     * would make `brovary` canonical again while the alias still points the other way (a 308
     * loop) and wipe the imported fields. Conflicts on any unique key (id, slug, code) are skipped.
     */
    async insertMissing(cityList: readonly City[]): Promise<void> {
      if (cityList.length === 0) return;
      await db.insert(cities).values(cityList.map(cityToRow)).onConflictDoNothing();
    },

    async insertMany(cityList: readonly City[]): Promise<void> {
      if (cityList.length === 0) return;
      await db.insert(cities).values(cityList.map(cityToRow));
    },
  };
}
