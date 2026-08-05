import type { CityId } from "@opika/domain";
import { doublePrecision, pgTable, text } from "drizzle-orm/pg-core";

export const cities = pgTable("cities", {
  id: text().primaryKey().$type<CityId>(),
  nameUk: text("name_uk").notNull(),
  nameEnText: text("name_en_text"),
  nameEnProvenance: text("name_en_provenance", {
    enum: ["human", "machine"],
  }),
  centroidLat: doublePrecision("centroid_lat").notNull(),
  centroidLng: doublePrecision("centroid_lng").notNull(),
});
