import type { AdopterId, AnimalId, ContactReveal, RevealId } from "@opika/domain";
import { and, count, desc, eq, gt, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { reveals } from "../schema/reveals";
import { revealToRow, rowToReveal } from "./mappers";

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

    /**
     * Keyset-paginated list of reveals for an adopter.
     *
     * Ordering: `(revealed_at DESC, id DESC)`. The id tiebreaker prevents
     * skips or duplicates when two reveals share a timestamp — the same
     * defect class as OFFSET pagination.
     */
    async listByAdopter(
      adopterId: AdopterId,
      opts: { limit: number; cursor?: { revealedAt: Date; id: string } },
    ): Promise<readonly ContactReveal[]> {
      const conditions: SQL[] = [eq(reveals.adopterId, adopterId)];

      if (opts.cursor) {
        const cursorTs = opts.cursor.revealedAt.toISOString();
        conditions.push(
          sql`(${reveals.revealedAt} < ${cursorTs}::timestamptz
            OR (${reveals.revealedAt} = ${cursorTs}::timestamptz
              AND ${reveals.id} < ${opts.cursor.id}))`,
        );
      }

      const rows = await db
        .select()
        .from(reveals)
        .where(and(...conditions))
        .orderBy(desc(reveals.revealedAt), desc(reveals.id))
        .limit(opts.limit);

      return rows.map(rowToReveal);
    },

    /**
     * Count reveals by an adopter within a time window.
     *
     * Used by the reveal rate limiter. Keeping this query inside the
     * repository prevents the Drizzle query builder from leaking into
     * feature code (standing check: repository boundary).
     */
    async countRecentByAdopter(adopterId: AdopterId, since: Date): Promise<number> {
      const rows = await db
        .select({ cnt: count() })
        .from(reveals)
        .where(and(eq(reveals.adopterId, adopterId), gt(reveals.revealedAt, since)));
      return rows[0]?.cnt ?? 0;
    },

    async insert(reveal: ContactReveal): Promise<void> {
      await db.insert(reveals).values(revealToRow(reveal));
    },
  };
}
