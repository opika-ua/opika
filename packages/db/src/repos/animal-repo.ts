import type { Animal, AnimalId, CityId, ShelterId } from "@opika/domain";
import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { animalToRowWithCity, firstPublishedAnchorOf, rowToAnimal } from "./mappers";

export function animalRepo(db: Database) {
  return {
    async findById(id: AnimalId): Promise<Animal | null> {
      const rows = await db.select().from(animals).where(eq(animals.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToAnimal(row) : null;
    },

    /**
     * The saved page's own lookup (S8, DR1-Q2): one query for the whole
     * batch, not one `findById` per id. An empty `ids` short-circuits
     * before the query — `inArray` with nothing to match is a query Postgres
     * would answer correctly anyway, but there is no reason to send it.
     * Missing ids are simply absent from the result, same as `findById`
     * returning `null` for one; the caller (the handler) is what turns that
     * absence into the contract's `unavailable` entry.
     */
    async findByIds(ids: readonly AnimalId[]): Promise<readonly Animal[]> {
      if (ids.length === 0) return [];
      const rows = await db.select().from(animals).where(inArray(animals.id, ids));
      return rows.map(rowToAnimal);
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
        .set({
          ...animalToRowWithCity(animal, cityId),
          // Never cleared (HS-Q9): a row that was ever public stays marked.
          firstPublishedAt: sql`COALESCE(${animals.firstPublishedAt}, ${firstPublishedAnchorOf(animal.listing)?.toISOString() ?? null}::timestamptz)`,
        })
        .where(eq(animals.id, animal.id));
    },
  };
}
