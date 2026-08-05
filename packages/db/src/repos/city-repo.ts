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

    async insertMany(cityList: readonly City[]): Promise<void> {
      if (cityList.length === 0) return;
      await db.insert(cities).values(cityList.map(cityToRow));
    },
  };
}
