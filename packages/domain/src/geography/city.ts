import { z } from "zod";
import { CoordinatesSchema } from "../primitives/coordinates";
import { CityIdSchema } from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { CitySlugSchema } from "./city-slug";

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
  name: LocalizedTextSchema,
  centroid: CoordinatesSchema,
  slug: CitySlugSchema,
});
export type City = z.infer<typeof CitySchema>;
