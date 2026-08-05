import type { AdopterId, AdopterProfile } from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { adopters } from "../schema/adopters";
import { adopterToRow, rowToAdopter } from "./mappers";

export function adopterRepo(db: Database) {
  return {
    async findById(id: AdopterId): Promise<AdopterProfile | null> {
      const rows = await db.select().from(adopters).where(eq(adopters.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToAdopter(row) : null;
    },

    async findByDeviceSessionId(sessionId: string): Promise<AdopterProfile | null> {
      const rows = await db
        .select()
        .from(adopters)
        .where(eq(adopters.deviceSessionId, sessionId))
        .limit(1);
      const row = rows[0];
      return row ? rowToAdopter(row) : null;
    },

    async insert(profile: AdopterProfile): Promise<void> {
      await db.insert(adopters).values(adopterToRow(profile));
    },

    async update(profile: AdopterProfile): Promise<void> {
      await db.update(adopters).set(adopterToRow(profile)).where(eq(adopters.id, profile.id));
    },
  };
}
