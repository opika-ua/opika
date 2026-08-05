import { z } from "zod";
import { AccountIdSchema, AdopterIdSchema, CountryCodeSchema } from "../primitives/ids.js";
import { LocaleSchema } from "../primitives/locale.js";
import { FeedFiltersSchema } from "./feed-filters.js";

/**
 * The `account` variant is unreachable while adopter accounts are deferred.
 * It is modelled anyway because the reason deferring them is safe is that
 * adding them stays additive — and that only holds if identity is a union from
 * the start. A boolean `isAnonymous` plus a nullable email would be the same
 * information with none of the guarantees.
 */
export const AdopterIdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anonymous"), deviceSessionId: z.string().min(1) }),
  z.object({ kind: z.literal("account"), accountId: AccountIdSchema, email: z.email() }),
]);
export type AdopterIdentity = z.infer<typeof AdopterIdentitySchema>;

export const AdopterProfileSchema = z.object({
  id: AdopterIdSchema,
  identity: AdopterIdentitySchema,
  country: CountryCodeSchema,
  preferredLocale: LocaleSchema,
  savedFilters: FeedFiltersSchema.nullable(),
  createdAt: z.date(),
});
export type AdopterProfile = z.infer<typeof AdopterProfileSchema>;
