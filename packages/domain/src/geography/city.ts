import { z } from "zod";
import { CoordinatesSchema } from "../primitives/coordinates";
import { CityIdSchema } from "../primitives/ids";
import { TranslatedTextSchema } from "../primitives/localized-text";
import { CitySlugSchema } from "./city-slug";

/**
 * Not `LocalizedTextSchema` — that type's `en` is nullable (an animal or
 * shelter description can be Ukrainian-only), but a city's `slug` is
 * required and derived from `en.text` (`citySlugOf`, `./city-slug.ts`), so a
 * `City` with no English name is not a state this type can represent at
 * all. `cities.name_en_text`/`name_en_provenance` are `NOT NULL` in the
 * database for the same reason (`packages/db/src/schema/cities.ts`,
 * tightened 2026-09-12) — this schema makes that guarantee a compile-time
 * one instead of a runtime check repeated at every construction site.
 */
export const CityNameSchema = z.object({
  uk: z.string().min(1),
  en: TranslatedTextSchema,
});
export type CityName = z.infer<typeof CityNameSchema>;

/**
 * Cities are a controlled list rather than free text on a shelter, because the
 * feed filter has to be enumerable and two spellings of the same city would
 * split it in two.
 *
 * `centroid` is what a map opens on when a filter selects this city. It is not
 * a shelter position and carries no privacy weight.
 *
 * `slug` is stored, not derived from `name` at read time — `citySlugOf`
 * (`./city-slug.ts`) is deterministic today, but a name typo-fix must never
 * silently change a public URL every link to this city already uses
 * (`docs/observations.md` O-6/O-12, same reasoning as decision #16's
 * `wait_anchor_at`: an anchor is captured once, not recomputed from a field
 * that can drift).
 */
export const CitySchema = z.object({
  id: CityIdSchema,
  name: CityNameSchema,
  centroid: CoordinatesSchema,
  slug: CitySlugSchema,
});
export type City = z.infer<typeof CitySchema>;
