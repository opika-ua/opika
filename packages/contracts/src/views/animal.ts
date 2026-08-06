import { AgeBucketSchema, AnimalPhotoSchema, AnimalSchema, FreshnessSchema } from "@opika/domain";
import type { z } from "zod";
import { ShelterSummaryViewSchema } from "./shelter";

/**
 * Age and freshness are sent as derived values rather than as the raw estimate
 * and timestamp.
 *
 * The client has no trustworthy clock — a device with a wrong date could
 * otherwise render a stale listing as fresh, or a senior animal as a puppy.
 * Deriving on the server makes the honesty guarantee something the platform
 * provides rather than something it hopes for.
 */
const derivedAnimalFacts = {
  ageBucket: AgeBucketSchema,
  freshness: FreshnessSchema,
};

/** Deliberately lean: the deck holds several of these in memory at once. */
export const FeedCardViewSchema = AnimalSchema.pick({
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  publicLocation: true,
})
  .extend(derivedAnimalFacts)
  .extend({
    primaryPhoto: AnimalPhotoSchema.nullable(),
    shelter: ShelterSummaryViewSchema,
  });
export type FeedCardView = z.infer<typeof FeedCardViewSchema>;

export const AnimalDetailViewSchema = AnimalSchema.pick({
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  publicLocation: true,
  description: true,
  photos: true,
  vaccination: true,
  spayNeuter: true,
  documentReadiness: true,
})
  .extend(derivedAnimalFacts)
  .extend({
    shelter: ShelterSummaryViewSchema,
  });
export type AnimalDetailView = z.infer<typeof AnimalDetailViewSchema>;
