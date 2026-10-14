import { CityPrecisionLocationSchema } from "@opika/domain";
import type { z } from "zod";

/**
 * Where an animal or a shelter is, as an adopter receives it before a reveal:
 * the city, and nothing finer.
 *
 * Oleksii, 2026-10-14 (inbox EM-Q10, answer (a)), verbatim: "Stop sending
 * district and fuzzed coordinates in public responses before a reveal (exact
 * address after a reveal stays, per decision #2). Contract test: the public
 * pre-reveal schema contains no district and no coordinates. Re-adding them
 * needs an explicit decision. Fuzzing stays server-side, just not
 * serialized." Until then the views carried the domain's whole
 * `PublicLocation`, district and 1 km-fuzzed point included, which no adopter
 * screen ever rendered but every network tab showed.
 *
 * Built with `pick` from the domain's city-precision variant, so a field added
 * to the domain location never reaches this view without someone deciding it
 * should. Both variants carry the same `cityId`; picking it from the variant
 * with no coordinates at all keeps even the source of this view free of them.
 * `precision` is not picked either: whether an animal is fostered is already
 * said by `publicLocation` being non-null on the animal, and a
 * `fuzzed_address` tag on a value with no address-derived content would
 * describe something the response no longer contains.
 *
 * `pre-reveal-location.test.ts` walks every pre-reveal output schema for the
 * forbidden keys; the served-response test in `apps/web` checks the JSON.
 */
export const PublicCityLocationViewSchema = CityPrecisionLocationSchema.pick({
  cityId: true,
});
export type PublicCityLocationView = z.infer<typeof PublicCityLocationViewSchema>;
