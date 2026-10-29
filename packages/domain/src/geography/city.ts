import { z } from "zod";
import { CoordinatesSchema } from "../primitives/coordinates";
import { CityIdSchema } from "../primitives/ids";
import { TranslatedTextSchema } from "../primitives/localized-text";
import { CitySlugSchema } from "./city-slug";
import { RegionIdSchema } from "./region";

/**
 * Not `LocalizedTextSchema` - that type's `en` is nullable (an animal or
 * shelter description can be Ukrainian-only), but a city's `slug` is
 * required and derived from `en.text` (`citySlugOf`, `./city-slug.ts`), so a
 * `City` with no English name is not a state this type can represent at
 * all. `cities.name_en_text`/`name_en_provenance` are `NOT NULL` in the
 * database for the same reason (`packages/db/src/schema/cities.ts`,
 * tightened 2026-09-12) - this schema makes that guarantee a compile-time
 * one instead of a runtime check repeated at every construction site.
 */
export const CityNameSchema = z.object({
  uk: z.string().min(1),
  en: TranslatedTextSchema,
});
export type CityName = z.infer<typeof CityNameSchema>;

export const SettlementKindSchema = z.enum(["special_status_city", "city", "selyshche", "village"]);
export type SettlementKind = z.infer<typeof SettlementKindSchema>;

/**
 * What a display must add to the name to be unambiguous. Computed across the whole dataset at
 * import, never typed by hand; the 8 seeded cities start at `unique_in_ukraine`.
 */
export const NameScopeSchema = z.enum([
  "unique_in_ukraine",
  "unique_in_region",
  "unique_in_district",
  "shared_in_district",
]);
export type NameScope = z.infer<typeof NameScopeSchema>;

/**
 * A union rather than a nullable pair: most settlements have no recorded centre until a feature
 * reads one, and a fabricated fallback would claim precision that does not exist.
 */
export const CityCentroidSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_recorded") }),
  z.object({
    kind: z.literal("recorded"),
    coordinates: CoordinatesSchema,
    source: z.enum(["manual"]),
  }),
]);
export type CityCentroid = z.infer<typeof CityCentroidSchema>;

const AdministrativeNameSchema = z.object({ uk: z.string().min(1) });

/**
 * Cities are a controlled list rather than free text on a shelter, because the
 * feed filter has to be enumerable and two spellings of the same city would
 * split it in two.
 *
 * `centroid` is what a map opens on when a filter selects this city. It is not
 * a shelter position and carries no privacy weight.
 *
 * `slug` is stored, not derived from `name` at read time - `citySlugOf`
 * (`./city-slug.ts`) is deterministic today, but a name typo-fix must never
 * silently change a public URL every link to this city already uses
 * (`docs/observations.md` O-6/O-12, same reasoning as decision #16's
 * `wait_anchor_at`: an anchor is captured once, not recomputed from a field
 * that can drift).
 */
export const CitySchema = z.object({
  id: CityIdSchema,
  regionId: RegionIdSchema,
  kind: SettlementKindSchema,
  name: CityNameSchema,
  /** Null for Kyiv and Sevastopol, which have no raion. */
  district: AdministrativeNameSchema.nullable(),
  hromada: AdministrativeNameSchema.nullable(),
  nameScope: NameScopeSchema,
  centroid: CityCentroidSchema,
  slug: CitySlugSchema,
});
export type City = z.infer<typeof CitySchema>;
