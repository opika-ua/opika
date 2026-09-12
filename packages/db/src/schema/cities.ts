import type { CityId } from "@opika/domain";
import { doublePrecision, pgTable, text } from "drizzle-orm/pg-core";

/**
 * `nameEnText`/`nameEnProvenance` tightened to `NOT NULL` 2026-09-12
 * (migration `0005`, alongside `slug`) — verified against Neon first, not
 * assumed: all 8 real rows carry both. Tightened together, not
 * `nameEnText` alone: `mappers.ts`'s `columnsToLocalizedText` *used to*
 * require both non-null before it treated a city as having a real English
 * name at all (`enText != null && enProvenance != null`) — that was the
 * finding that motivated tightening both, though `rowToCity` no longer
 * calls that shared helper as of this same change (it reads
 * `nameEnText`/`nameEnProvenance` directly now that both are guaranteed —
 * see `mappers.ts`'s own City-specific comment). The underlying risk this
 * closes is unchanged regardless of which function reads the columns: a
 * `slug` that's `NOT NULL` but derived from an `en` half of which is still
 * missing (text present, provenance null, or vice versa) is the "required
 * value depending on an optional one" problem restated one column over.
 */
export const cities = pgTable("cities", {
  id: text().primaryKey().$type<CityId>(),
  slug: text().notNull().unique(),
  nameUk: text("name_uk").notNull(),
  nameEnText: text("name_en_text").notNull(),
  nameEnProvenance: text("name_en_provenance", {
    enum: ["human", "machine"],
  }).notNull(),
  centroidLat: doublePrecision("centroid_lat").notNull(),
  centroidLng: doublePrecision("centroid_lng").notNull(),
});
