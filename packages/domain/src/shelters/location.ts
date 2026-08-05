import { z } from "zod";
import {
  CoordinatesSchema,
  FuzzedCoordinatesSchema,
  fuzzCoordinates,
  type LocationPrivacyPolicy,
} from "../primitives/coordinates.js";
import { CityIdSchema, type ShelterId } from "../primitives/ids.js";
import { LocalizedTextSchema } from "../primitives/localized-text.js";

/**
 * What the feed and the public profile are allowed to show. District is
 * nullable because smaller towns are not subdivided, and null survives a JSON
 * round trip in a way an absent property does not.
 *
 * `approximate` requires the branded fuzzed type, so this object cannot be
 * assembled from a precise position by accident.
 */
export const PublicLocationSchema = z.object({
  cityId: CityIdSchema,
  district: LocalizedTextSchema.nullable(),
  approximate: FuzzedCoordinatesSchema,
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

/**
 * The only sanctioned way to derive what the public may see from what the
 * shelter actually told us.
 *
 * Having one constructor matters more than it looks: the alternative is every
 * repository and every seed script assembling a `PublicLocation` by hand, and
 * it only takes one of them to pass the exact coordinates through. Here the
 * fuzzing is not something a caller remembers to do.
 */
export const publicLocationOf = (
  shelterId: ShelterId,
  exactAddress: ExactAddress,
  policy: LocationPrivacyPolicy,
): PublicLocation => ({
  cityId: exactAddress.cityId,
  district: exactAddress.district,
  approximate: fuzzCoordinates(exactAddress.coordinates, shelterId, policy),
});
