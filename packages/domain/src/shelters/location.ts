import { z } from "zod";
import { ApproximateCoordinatesSchema, CoordinatesSchema } from "../primitives/coordinates.js";
import { CityIdSchema } from "../primitives/ids.js";
import { LocalizedTextSchema } from "../primitives/localized-text.js";

/**
 * What the feed and the public profile are allowed to show. District is
 * nullable because smaller towns are not subdivided, and null survives a JSON
 * round trip in a way an absent property does not.
 */
export const PublicLocationSchema = z.object({
  cityId: CityIdSchema,
  district: LocalizedTextSchema.nullable(),
  approximate: ApproximateCoordinatesSchema,
});
export type PublicLocation = z.infer<typeof PublicLocationSchema>;

/**
 * Present on the domain object and absent from every public view. It reaches an
 * adopter only inside a ContactReveal snapshot, after they have committed to
 * the reveal — the same gate the contact details sit behind.
 */
export const ExactAddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().min(1).nullable(),
  postalCode: z.string().min(1).nullable(),
  cityId: CityIdSchema,
  district: LocalizedTextSchema.nullable(),
  coordinates: CoordinatesSchema,
});
export type ExactAddress = z.infer<typeof ExactAddressSchema>;
