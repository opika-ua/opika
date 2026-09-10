import type { AdopterId, AnimalId, ContactReveal, RevealId, ShelterId } from "@opika/domain";
import { and, countDistinct, desc, eq, gt, type SQL, sql } from "drizzle-orm";
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
     * Count *distinct shelters* an adopter has revealed contact details for,
     * within a time window.
     *
     * Used by the reveal rate limiter. Deliberately shelter-count, not
     * row-count: contacts are scrapeable per shelter, not per animal, so a
     * device right-swiping many animals at the same shelter should not cost
     * more than one unit — `hasRevealedShelterRecently` below is what lets
     * the caller skip this check entirely for a shelter already counted.
     * Keeping this query inside the repository prevents the Drizzle query
     * builder from leaking into feature code (standing check: repository
     * boundary).
     */
    async countDistinctSheltersRecentByAdopter(adopterId: AdopterId, since: Date): Promise<number> {
      const rows = await db
        .select({ cnt: countDistinct(reveals.shelterId) })
        .from(reveals)
        .where(and(eq(reveals.adopterId, adopterId), gt(reveals.revealedAt, since)));
      return rows[0]?.cnt ?? 0;
    },

    /**
     * Whether an adopter has already revealed *this* shelter's contact
     * details within a time window — the free-re-reveal check the rate
     * limiter runs before it ever counts against the budget.
     */
    async hasRevealedShelterRecently(
      adopterId: AdopterId,
      shelterId: ShelterId,
      since: Date,
    ): Promise<boolean> {
      const rows = await db
        .select({ id: reveals.id })
        .from(reveals)
        .where(
          and(
            eq(reveals.adopterId, adopterId),
            eq(reveals.shelterId, shelterId),
            gt(reveals.revealedAt, since),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async insert(reveal: ContactReveal): Promise<void> {
      await db.insert(reveals).values(revealToRow(reveal));
    },
  };
}
