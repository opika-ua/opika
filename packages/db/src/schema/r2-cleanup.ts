import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`): one row per real R2 object
 * key the clean-up job has observed unreferenced, so far. Populated and
 * maintained entirely by the job's own daily scan - never by the photo
 * upload/remove write paths, which stay unaware this table exists. A key
 * that becomes referenced again before its grace period elapses (an edit
 * racing another) has its row deleted on the next scan, self-healing rather
 * than needing a hook in every write path that could touch `animals.photos`
 * or `reveals.animal_snapshot`.
 *
 * `objectKey` is the real R2 object key (`{storageKey}/{variant}.webp`),
 * never the bare `storageKey` - the three variants of one photo can age out
 * of reference at slightly different scan instants in principle (they never
 * do in practice, since they're always written and referenced together,
 * but the table makes no assumption that they must).
 */
export const r2UnreferencedObjects = pgTable("r2_unreferenced_objects", {
  objectKey: text("object_key").primaryKey(),
  firstSeenUnreferencedAt: timestamp("first_seen_unreferenced_at", {
    withTimezone: true,
  }).notNull(),
});
