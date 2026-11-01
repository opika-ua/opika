import type { CityId } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { cities } from "./cities";

/**
 * Former public slugs of a city, so an old `?misto=` link can answer a 308 to the current one.
 * A slug is either canonical (`cities.slug`) or an alias, never both; the importer asserts it.
 */
export const citySlugAliases = pgTable(
  "city_slug_aliases",
  {
    slug: text().primaryKey(),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id)
      .$type<CityId>(),
    reason: text({ enum: ["legacy", "renamed"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("city_slug_aliases_city_id_idx").on(t.cityId),
    check("city_slug_aliases_reason_values", sql`${t.reason} IN ('legacy', 'renamed')`),
  ],
);
