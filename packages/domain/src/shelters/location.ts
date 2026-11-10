import { z } from "zod";
import {
  CoordinatesSchema,
  FuzzedCoordinatesSchema,
  fuzzCoordinates,
  type LocationPrivacyPolicy,
} from "../primitives/coordinates";
import { type CityId, CityIdSchema, type ShelterId } from "../primitives/ids";
import { type LocalizedText, LocalizedTextSchema } from "../primitives/localized-text";

/**
 * "How well do we know this location" is a union, not a nullable - same idiom
 * as `MedicalAttestation.source`, `DocumentItem.kind` and `Freshness.kind`.
 * This makes the false-precision state unrepresentable rather than merely
 * discouraged, and forces the UI to switch on `precision` and decide what to
 * render.
 *
 * `fuzzed_address`: the shelter has an exact address with its point; this
 * holds the city, district, and fuzzed coordinates.
 *
 * `city`: we know only the city (and optionally the district). No coordinates
 * at all - the city centroid is `City.centroid`, honestly labelled as such,
 * rather than posing as the animal's position.
 * Fostered animals and shelters with no known point produce this variant.
 *
 * District is nullable in both variants because smaller towns are not
 * subdivided, and null survives a JSON round trip in a way an absent property
 * does not.
 *
 * "Public" names where this came from (the value a public view was built
 * from), not what an adopter receives. Since 2026-10-14 (Oleksii, inbox
 * EM-Q10, answer (a)) no adopter-facing response before a reveal serializes
 * the district or the fuzzed coordinates: the public views carry the city
 * only (`PublicCityLocationViewSchema` in `@opika/contracts`). This value is
 * still built here, server-side, and still stored whole inside a reveal's
 * `shelterSnapshot`, but since 2026-10-15 (EM-D1, decision #2 revised) the
 * reveal's view sends the city only too. The two variants are named so a
 * view can `pick` from one rather than restate its fields.
 */
export const FuzzedAddressLocationSchema = z.object({
  precision: z.literal("fuzzed_address"),
  cityId: CityIdSchema,
  district: LocalizedTextSchema.nullable(),
  approximate: FuzzedCoordinatesSchema,
});

export const CityPrecisionLocationSchema = z.object({
  precision: z.literal("city"),
  cityId: CityIdSchema,
  district: LocalizedTextSchema.nullable(),
});

export const PublicLocationSchema = z.discriminatedUnion("precision", [
  FuzzedAddressLocationSchema,
  CityPrecisionLocationSchema,
]);
export type PublicLocation = z.infer<typeof PublicLocationSchema>;

/**
 * Present on the domain object and absent from every adopter-facing view,
 * before and after a reveal (Oleksii, 2026-10-15, inbox EM-B6 answer 5,
 * decision EM-D1: "the exact address never leaves the server for adopters;
 * the meeting place is agreed with the shelter"). A ContactReveal snapshot
 * stores it as the operator's record; the reveal's view leaves it out.
 */
export const ExactAddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().min(1).nullable(),
  postalCode: z.string().min(1).nullable(),
  cityId: CityIdSchema,
  district: LocalizedTextSchema.nullable(),
  /** Null when the street is known but not its point; nothing public ever used the point. */
  coordinates: CoordinatesSchema.nullable(),
});
export type ExactAddress = z.infer<typeof ExactAddressSchema>;

/**
 * The only sanctioned way to derive what the public may see from what the
 * shelter actually told us.
 *
 * Having one constructor matters more than it looks: the alternative is every
 * repository and every seed script assembling a `PublicLocation` by hand, and
 * it only takes one of them to pass the exact coordinates through. Here the
 * fuzzing is not something a caller remembers to do. An address without its
 * point yields the honest `city` variant, never a city-centre guess.
 */
export const publicLocationOf = (
  shelterId: ShelterId,
  exactAddress: ExactAddress,
  policy: LocationPrivacyPolicy,
): PublicLocation =>
  exactAddress.coordinates === null
    ? cityPublicLocationOf(exactAddress.cityId, exactAddress.district)
    : {
        precision: "fuzzed_address",
        cityId: exactAddress.cityId,
        district: exactAddress.district,
        approximate: fuzzCoordinates(exactAddress.coordinates, shelterId, policy),
      };

/**
 * Public location when only the city is known: an animal fostered away from
 * its shelter, or a shelter with no address (or no point) on file yet.
 *
 * Produces a `city`-precision location - no coordinates at all. The city
 * centroid is `City.centroid`, honestly labelled as a centroid rather than
 * posing as the animal's position.
 * Generating fuzzed coordinates from the centroid would be manufactured
 * precision: a random point within 1 km of city centre reads as "we know
 * roughly where this animal is" when in fact we only know the city.
 */
export const cityPublicLocationOf = (
  cityId: CityId,
  district: LocalizedText | null,
): PublicLocation => ({
  precision: "city",
  cityId,
  district,
});
