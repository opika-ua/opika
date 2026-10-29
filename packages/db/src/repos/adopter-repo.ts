import type { AdopterId, AdopterProfile } from "@opika/domain";
import { and, count, eq, inArray, lt, notExists } from "drizzle-orm";
import type { Database } from "../client";
import { adopters } from "../schema/adopters";
import { reveals } from "../schema/reveals";
import { sessions } from "../schema/sessions";
import { swipes } from "../schema/swipes";
import { adopterToRow, rowToAdopter } from "./mappers";
import { ADOPTER_CLEANUP_BATCH, ADOPTER_SESSION_POLICY } from "./session-repo";

/**
 * How old an adopter must be before the clean-up may delete it: its session's absolute limit,
 * plus a day. Its one session is created with it, so by then that session is dead whatever
 * happened; the day keeps the delete clear of a bootstrap between its two inserts and of a
 * request that validated just inside the limit.
 */
export const ORPHAN_ADOPTER_MIN_AGE_MS =
  (ADOPTER_SESSION_POLICY.absoluteExpirySeconds + 86_400) * 1000;

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

    /**
     * Deletes up to `limit` anonymous adopters that nothing can reach or needs (audit F6): no
     * session (only `session.bootstrap` makes one, always with a new adopter, so none can come
     * back), no swipe and no reveal, and older than `ORPHAN_ADOPTER_MIN_AGE_MS`. An adopter with
     * a swipe or a reveal stays: deleting it means deleting those first, and reveals are an
     * append-only record (decision 9) whose retention is not decided (gdpr-analysis G3).
     * With no session, nothing can add a child while this runs; were one added anyway, the
     * foreign key refuses the whole statement rather than leave it orphaned.
     */
    async deleteOrphaned(now: Date, limit: number = ADOPTER_CLEANUP_BATCH): Promise<number> {
      const orphaned = and(
        eq(adopters.identityKind, "anonymous"),
        lt(adopters.createdAt, new Date(now.getTime() - ORPHAN_ADOPTER_MIN_AGE_MS)),
        notExists(
          db
            .select({ adopterId: sessions.adopterId })
            .from(sessions)
            .where(eq(sessions.adopterId, adopters.id)),
        ),
        notExists(
          db
            .select({ adopterId: swipes.adopterId })
            .from(swipes)
            .where(eq(swipes.adopterId, adopters.id)),
        ),
        notExists(
          db
            .select({ adopterId: reveals.adopterId })
            .from(reveals)
            .where(eq(reveals.adopterId, adopters.id)),
        ),
      );
      const batch = db.select({ id: adopters.id }).from(adopters).where(orphaned).limit(limit);
      const deleted = db
        .$with("orphaned_adopters")
        .as(db.delete(adopters).where(inArray(adopters.id, batch)).returning({ id: adopters.id }));
      const [row] = await db.with(deleted).select({ count: count() }).from(deleted);
      return row?.count ?? 0;
    },
  };
}
