import type { CityId, RegionId } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, doublePrecision, index, pgTable, text } from "drizzle-orm/pg-core";
import { regions } from "./regions";

/**
 * `nameEnText`/`nameEnProvenance` are `NOT NULL` since migration `0005`, together with `slug`: a
 * slug derived from an English name must not depend on an optional half of that name.
 *
 * Geography columns (migration `0020`): `katottg_code` is import provenance and stays out of the
 * domain; `search_name`/`search_latin` are stored keys built by `searchNameOf`/`searchLatinOf`;
 * the centroid is nullable because no feature reads it yet.
 */
export const cities = pgTable(
  "cities",
  {
    id: text().primaryKey().$type<CityId>(),
    slug: text().notNull().unique(),
    nameUk: text("name_uk").notNull(),
    nameEnText: text("name_en_text").notNull(),
    nameEnProvenance: text("name_en_provenance", {
      enum: ["human", "machine"],
    }).notNull(),
    regionId: text("region_id")
      .notNull()
      .references(() => regions.id)
      .$type<RegionId>(),
    kind: text({ enum: ["special_status_city", "city", "selyshche", "village"] }).notNull(),
    katottgCode: text("katottg_code").unique(),
    districtNameUk: text("district_name_uk"),
    hromadaNameUk: text("hromada_name_uk"),
    nameScope: text("name_scope", {
      enum: ["unique_in_ukraine", "unique_in_region", "unique_in_district", "shared_in_district"],
    }).notNull(),
    searchName: text("search_name").notNull(),
    searchLatin: text("search_latin").notNull(),
    centroidLat: doublePrecision("centroid_lat"),
    centroidLng: doublePrecision("centroid_lng"),
    centroidSource: text("centroid_source", { enum: ["manual"] }),
    sourceEdition: text("source_edition"),
    retiredInEdition: text("retired_in_edition"),
  },
  (t) => [
    index("cities_region_id_idx").on(t.regionId),
    index("cities_search_name_prefix_idx").on(t.searchName.op("text_pattern_ops")),
    index("cities_search_latin_prefix_idx").on(t.searchLatin.op("text_pattern_ops")),
    index("cities_search_name_trgm_idx").using("gin", t.searchName.op("gin_trgm_ops")),
    index("cities_search_latin_trgm_idx").using("gin", t.searchLatin.op("gin_trgm_ops")),
    check(
      "cities_kind_values",
      sql`${t.kind} IN ('special_status_city', 'city', 'selyshche', 'village')`,
    ),
    check(
      "cities_name_scope_values",
      sql`${t.nameScope} IN ('unique_in_ukraine', 'unique_in_region', 'unique_in_district', 'shared_in_district')`,
    ),
    check("cities_katottg_code_format", sql`${t.katottgCode} ~ '^UA[0-9]{17}$'`),
    check("cities_centroid_source_values", sql`${t.centroidSource} IN ('manual')`),
    check(
      "cities_centroid_all_or_none",
      sql`(${t.centroidLat} IS NULL) = (${t.centroidLng} IS NULL) AND (${t.centroidLat} IS NULL) = (${t.centroidSource} IS NULL)`,
    ),
  ],
);
