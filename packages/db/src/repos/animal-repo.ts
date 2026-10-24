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

    /**
     * A full-row overwrite with no compare-and-set — test and harness setup
     * only (writing an arbitrary state directly, skipping the handler
     * guards), never called from `apps/web`'s production handlers. Pinned by
     * `visibility-write-scan.test.ts`'s `animalRepo.update` reachability
     * check, not left to this comment alone (Tier 1 review finding 3, PR
     * #196): if it ever is called from production code, its everServedAt
     * COALESCE below still holds — the real risk was the field it protects,
     * not just who calls it.
     */
    async update(animal: Animal, cityId: CityId): Promise<void> {
      await db
        .update(animals)
        .set({
          ...animalToRowWithCity(animal, cityId),
          // Never cleared (HS-Q9): a row that was ever public stays marked.
          firstPublishedAt: sql`COALESCE(${animals.firstPublishedAt}, ${firstPublishedAnchorOf(animal.listing)?.toISOString() ?? null}::timestamptz)`,
          // Same reasoning as firstPublishedAt, just above: a full-row
          // overwrite must never clear a fact set once hooks 1–3 have
          // stamped it (Tier 1 review finding 3 — this used to overwrite
          // unconditionally with whatever `animal.everServedAt` the caller
          // passed, the one place in the repo layer that didn't COALESCE it).
          everServedAt: sql`COALESCE(${animals.everServedAt}, ${animal.everServedAt?.toISOString() ?? null}::timestamptz)`,
        })
        .where(eq(animals.id, animal.id));
    },
  };
}
