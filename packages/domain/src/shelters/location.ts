import { z } from "zod";
import {
  CoordinatesSchema,
  FuzzedCoordinatesSchema,
  fuzzCoordinates,
  type LocationPrivacyPolicy,
} from "../primitives/coordinates.js";
import { type CityId, CityIdSchema, type ShelterId } from "../primitives/ids.js";
import { type LocalizedText, LocalizedTextSchema } from "../primitives/localized-text.js";

/**
 * "How well do we know this location" is a union, not a nullable — same idiom
 * as `MedicalAttestation.source`, `DocumentItem.kind` and `Freshness.kind`.
 * This makes the false-precision state unrepresentable rather than merely
 * discouraged, and forces the UI to switch on `precision` and decide what to
 * render.
 *
 * `fuzzed_address`: the shelter has an exact address; the public sees the city,
 * district, and fuzzed coordinates. Shelters always produce this variant.
 *
 * `city`: we know only the city (and optionally the district). No coordinates
 * at all — the city centroid is available via `CityView.centroid` and is
 * honestly labelled as such, rather than posing as the animal's position.
 * Fostered animals with no known address produce this variant.
 *
 * District is nullable in both variants because smaller towns are not
 * subdivided, and null survives a JSON round trip in a way an absent property
 * does not.
 */
export const PublicLocationSchema = z.discriminatedUnion("precision", [
  z.object({
    precision: z.literal("fuzzed_address"),
    cityId: CityIdSchema,
    district: LocalizedTextSchema.nullable(),
    approximate: FuzzedCoordinatesSchema,
  }),
  z.object({
    precision: z.literal("city"),
    cityId: CityIdSchema,
    district: LocalizedTextSchema.nullable(),
  }),
]);
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
  precision: "fuzzed_address",
  cityId: exactAddress.cityId,
  district: exactAddress.district,
  approximate: fuzzCoordinates(exactAddress.coordinates, shelterId, policy),
});

/**
 * Public location for an animal fostered away from its shelter.
 *
 * Produces a `city`-precision location — no coordinates at all. The city
 * centroid is available to the UI via `CityView.centroid` and is honestly
 * labelled as a centroid rather than posing as the animal's position.
 * Generating fuzzed coordinates from the centroid would be manufactured
 * precision: a random point within 1 km of city centre reads as "we know
 * roughly where this animal is" when in fact we only know the city.
 */
export const animalPublicLocationOf = (
  cityId: CityId,
  district: LocalizedText | null,
): PublicLocation => ({
  precision: "city",
  cityId,
  district,
});
