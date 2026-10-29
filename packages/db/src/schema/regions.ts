import type { RegionId } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";

/**
 * The 27 first-level units. Rows are inserted by migration `0020` from
 * `geography/regions-data.ts`; nothing writes here at run time.
 */
export const regions = pgTable(
  "regions",
  {
    id: text().primaryKey().$type<RegionId>(),
    code: text().notNull().unique(),
    kind: text({ enum: ["oblast", "autonomous_republic", "special_status_city"] }).notNull(),
    slug: text().notNull().unique(),
    nameUk: text("name_uk").notNull(),
    nameUkShort: text("name_uk_short").notNull(),
    nameUkLabel: text("name_uk_label").notNull(),
    nameEn: text("name_en").notNull(),
  },
  (t) => [
    check("regions_code_format", sql`${t.code} ~ '^UA[0-9]{2}$'`),
    check(
      "regions_kind_values",
      sql`${t.kind} IN ('oblast', 'autonomous_republic', 'special_status_city')`,
    ),
  ],
);
