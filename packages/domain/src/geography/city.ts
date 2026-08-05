import { z } from "zod";
import { CoordinatesSchema } from "../primitives/coordinates";
import { CityIdSchema } from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";

/**
 * Cities are a controlled list rather than free text on a shelter, because the
 * feed filter has to be enumerable and two spellings of the same city would
 * split it in two.
 *
 * `centroid` is what a map opens on when a filter selects this city. It is not
 * a shelter position and carries no privacy weight.
 */
export const CitySchema = z.object({
  id: CityIdSchema,
  name: LocalizedTextSchema,
  centroid: CoordinatesSchema,
});
export type City = z.infer<typeof CitySchema>;
