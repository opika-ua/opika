import { CitySchema, ShelterSchema } from "@opika/domain";
import { z } from "zod";
import { PublicCityLocationViewSchema } from "./location";

/**
 * The only verification distinction an adopter is entitled to. Moderator
 * identities, submitted evidence and rejection reasons stay server-side.
 */
export const VerificationBadgeSchema = z.enum(["verified", "unverified"]);
export type VerificationBadge = z.infer<typeof VerificationBadgeSchema>;

/**
 * Built with `pick`, never `omit`.
 *
 * `omit` is allow-by-default: a field added to Shelter would appear here
 * silently, and the fields being withheld are an exact address and a set of
 * contact details. `pick` is deny-by-default — the same change breaks the build
 * until somebody decides. That difference is the whole safety property, so it
 * is a rule rather than a preference.
 *
 * `publicLocation` is the city only (`./location.ts`, Oleksii 2026-10-14,
 * EM-Q10): the shelter's domain location, district and fuzzed point included,
 * is not picked, and the handler projects it down.
 */
export const PublicShelterViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  description: true,
  donation: true,
  createdAt: true,
}).extend({
  publicLocation: PublicCityLocationViewSchema,
  verification: VerificationBadgeSchema,
});
export type PublicShelterView = z.infer<typeof PublicShelterViewSchema>;

/** What a card needs to name the shelter without loading its profile. */
export const ShelterSummaryViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  freshnessSentence: true,
}).extend({
  publicLocation: PublicCityLocationViewSchema,
  verification: VerificationBadgeSchema,
});
export type ShelterSummaryView = z.infer<typeof ShelterSummaryViewSchema>;

/**
 * No `centroid` (2026-10-14): a city's own centre is public geography, not a
 * shelter's position, but the rule Oleksii set for pre-reveal responses is
 * "no coordinates" (EM-Q10), nothing on the adopter side reads it (there is
 * no map), and the walk in `pre-reveal-location.test.ts` holds this list to
 * the same rule as every other pre-reveal output rather than carrying an
 * exemption. The domain `City` keeps it.
 */
export const CityViewSchema = CitySchema.pick({
  id: true,
  name: true,
  slug: true,
});
export type CityView = z.infer<typeof CityViewSchema>;
