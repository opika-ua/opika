import { type AnimalId, PHOTO_SOURCE_ORIGINS, type PhotoSourceOrigin } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { animals } from "./animals";

/**
 * A photo's kept source and its crop frame, one row per variants key (crop-frame shape §5).
 * A table, not fields on `animals.photos`: that jsonb is embedded in every public view, and the
 * source key must never reach one. An older photo simply has no row.
 */
export const animalPhotoSources = pgTable(
  "animal_photo_sources",
  {
    storageKey: text("storage_key").primaryKey(),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" })
      .$type<AnimalId>(),
    sourceObjectKey: text("source_object_key").notNull(),
    sourceOrigin: text("source_origin", { enum: PHOTO_SOURCE_ORIGINS })
      .notNull()
      .$type<PhotoSourceOrigin>(),
    sourceWidth: integer("source_width").notNull(),
    sourceHeight: integer("source_height").notNull(),
    /** In 1/FRAME_UNITS of the source; all four null is the automatic (attention) crop. */
    frameX: integer("frame_x"),
    frameY: integer("frame_y"),
    frameW: integer("frame_w"),
    frameH: integer("frame_h"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("animal_photo_sources_animal_idx").on(t.animalId),
    // A direct child of its photo's key with an unguessable name: the R2 clean-up protects only
    // direct children of a referenced key, and the bucket is public.
    check(
      "animal_photo_sources_object_key_check",
      sql`starts_with(${t.sourceObjectKey}, ${t.storageKey} || '/') AND substr(${t.sourceObjectKey}, length(${t.storageKey}) + 2) ~ '^source-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$'`,
    ),
    check(
      "animal_photo_sources_origin_check",
      sql`${t.sourceOrigin} IN ('upload', 'detail_variant')`,
    ),
    check("animal_photo_sources_size_check", sql`${t.sourceWidth} > 0 AND ${t.sourceHeight} > 0`),
    // PhotoFrameSchema's bounds on the stored units (10000 is FRAME_UNITS). The explicit IS NOT
    // NULLs matter: a CHECK passes on NULL, so a half-set frame would otherwise get through.
    check(
      "animal_photo_sources_frame_check",
      sql`(${t.frameX} IS NULL AND ${t.frameY} IS NULL AND ${t.frameW} IS NULL AND ${t.frameH} IS NULL) OR (${t.frameX} IS NOT NULL AND ${t.frameY} IS NOT NULL AND ${t.frameW} IS NOT NULL AND ${t.frameH} IS NOT NULL AND ${t.frameX} >= 0 AND ${t.frameY} >= 0 AND ${t.frameW} > 0 AND ${t.frameH} > 0 AND ${t.frameX} + ${t.frameW} <= 10000 AND ${t.frameY} + ${t.frameH} <= 10000)`,
    ),
  ],
);
