import { CitySchema, ShelterSchema } from "@opika/domain";
import { z } from "zod";

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
 */
export const PublicShelterViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  description: true,
  publicLocation: true,
  donation: true,
  createdAt: true,
}).extend({
  verification: VerificationBadgeSchema,
});
export type PublicShelterView = z.infer<typeof PublicShelterViewSchema>;

/** What a card needs to name the shelter without loading its profile. */
export const ShelterSummaryViewSchema = ShelterSchema.pick({
  id: true,
  displayName: true,
  publicLocation: true,
}).extend({
  verification: VerificationBadgeSchema,
});
export type ShelterSummaryView = z.infer<typeof ShelterSummaryViewSchema>;

export const CityViewSchema = CitySchema.pick({
  id: true,
  name: true,
  centroid: true,
});
export type CityView = z.infer<typeof CityViewSchema>;
