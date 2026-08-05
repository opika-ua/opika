import type { AdopterId, Swipe } from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { swipes } from "../schema/swipes";
import { rowToSwipe, swipeToRow } from "./mappers";

export function swipeRepo(db: Database) {
  return {
    async findByAdopterId(adopterId: AdopterId): Promise<readonly Swipe[]> {
      const rows = await db.select().from(swipes).where(eq(swipes.adopterId, adopterId));
      return rows.map(rowToSwipe);
    },

    /**
     * Upsert: if the adopter has already swiped this animal, update the
     * direction and timestamp. Returns true if newly inserted, false if updated.
     */
    async record(swipe: Swipe): Promise<boolean> {
      const row = swipeToRow(swipe);
      const result = await db
        .insert(swipes)
        .values(row)
        .onConflictDoUpdate({
          target: [swipes.adopterId, swipes.animalId],
          set: { direction: row.direction, swipedAt: row.swipedAt },
        })
        .returning({ adopterId: swipes.adopterId });
      return result.length > 0;
    },
  };
}
