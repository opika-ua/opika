import type { AdopterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { sessions } from "../schema/sessions";

export type SessionRow = {
  tokenHash: string;
  adopterId: AdopterId;
  createdAt: Date;
  lastSeenAt: Date;
};

export function sessionRepo(db: Database) {
  return {
    async findByHash(tokenHash: string): Promise<SessionRow | null> {
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      return rows[0] ?? null;
    },

    async insert(session: SessionRow): Promise<void> {
      await db.insert(sessions).values(session);
    },

    async touchLastSeen(tokenHash: string, now: Date): Promise<void> {
      await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, tokenHash));
    },

    async deleteByHash(tokenHash: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
  };
}
