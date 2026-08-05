import type { AdopterId, AnimalId, ContactReveal, RevealId } from "@opika/domain";
import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../client.js";
import { reveals } from "../schema/reveals.js";
import { revealToRow, rowToReveal } from "./mappers.js";

export function revealRepo(db: Database) {
  return {
    async findById(id: RevealId): Promise<ContactReveal | null> {
      const rows = await db.select().from(reveals).where(eq(reveals.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToReveal(row) : null;
    },

    async findByAdopterAndAnimal(
      adopterId: AdopterId,
      animalId: AnimalId,
    ): Promise<ContactReveal | null> {
      const rows = await db
        .select()
        .from(reveals)
        .where(and(eq(reveals.adopterId, adopterId), eq(reveals.animalId, animalId)))
        .limit(1);
      const row = rows[0];
      return row ? rowToReveal(row) : null;
    },

    async listByAdopter(
      adopterId: AdopterId,
      opts: { limit: number; cursor?: Date },
    ): Promise<readonly ContactReveal[]> {
      const query = db
        .select()
        .from(reveals)
        .where(
          opts.cursor
            ? and(eq(reveals.adopterId, adopterId), lt(reveals.revealedAt, opts.cursor))
            : eq(reveals.adopterId, adopterId),
        )
        .orderBy(desc(reveals.revealedAt))
        .limit(opts.limit);

      const rows = await query;
      return rows.map(rowToReveal);
    },

    async insert(reveal: ContactReveal): Promise<void> {
      await db.insert(reveals).values(revealToRow(reveal));
    },
  };
}
