import type { Animal, AnimalId, CityId, ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { animals } from "../schema/animals.js";
import { animalToRowWithCity, rowToAnimal } from "./mappers.js";

export function animalRepo(db: Database) {
  return {
    async findById(id: AnimalId): Promise<Animal | null> {
      const rows = await db.select().from(animals).where(eq(animals.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToAnimal(row) : null;
    },

    async findByShelterId(shelterId: ShelterId): Promise<readonly Animal[]> {
      const rows = await db.select().from(animals).where(eq(animals.shelterId, shelterId));
      return rows.map(rowToAnimal);
    },

    /**
     * Insert requires the shelter's city_id for the denormalised column.
     * The caller must resolve this — the repo does not look it up to avoid
     * a hidden N+1 in bulk inserts.
     */
    async insert(animal: Animal, cityId: CityId): Promise<void> {
      await db.insert(animals).values(animalToRowWithCity(animal, cityId));
    },

    async insertMany(entries: readonly { animal: Animal; cityId: CityId }[]): Promise<void> {
      if (entries.length === 0) return;
      await db.insert(animals).values(entries.map((e) => animalToRowWithCity(e.animal, e.cityId)));
    },

    async update(animal: Animal, cityId: CityId): Promise<void> {
      await db
        .update(animals)
        .set(animalToRowWithCity(animal, cityId))
        .where(eq(animals.id, animal.id));
    },
  };
}
