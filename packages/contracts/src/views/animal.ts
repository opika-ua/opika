import {
  AgeBucketSchema,
  AnimalPhotoSchema,
  DISCOVERABLE_LISTING_KINDS,
  FreshnessSchema,
  ListedAnimalSchema,
} from "@opika/domain";
import { z } from "zod";
import { PublicCityLocationViewSchema } from "./location";
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

/**
 * Null for an animal at its own shelter (the card names the shelter's city);
 * the foster city when fostered. City only, as the shelter's (`./location.ts`,
 * Oleksii 2026-10-14, EM-Q10): the domain value's district is not sent.
 */
const animalLocation = {
  publicLocation: PublicCityLocationViewSchema.nullable(),
};

/**
 * Narrower than `AnimalListingState["kind"]` on purpose: a `FeedCardView` is
 * only ever built from a discoverable animal (the feed/gallery predicate
 * already restricts to `DISCOVERABLE_LISTING_KINDS`), so `draft`, `adopted`
 * and `withdrawn` are states this view can never actually carry. Reusing the
 * domain constant rather than writing a fresh literal list means a change to
 * which kinds are discoverable is a compile error here, not a silent gap.
 *
 * Exists so the deck and the gallery can both render the "Уже домовляються"
 * reserved badge the design specifies — neither the deck nor (until now) the
 * gallery card had any way to know an animal was reserved, since nothing in
 * `FeedCardView` exposed listing state at all.
 */
const FeedCardListingKindSchema = z.enum(DISCOVERABLE_LISTING_KINDS);

/**
 * Both public views pick from `ListedAnimalSchema`, never the animal union
 * (F-B1): their `size` and `description` stay required, so a draft's missing
 * fact can't type-check into one, and oRPC's output validation refuses a
 * null on the way out (fail closed, a 500 that leaks nothing).
 */

/** Deliberately lean: the deck holds several of these in memory at once. */
export const FeedCardViewSchema = ListedAnimalSchema.pick({
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  coatLength: true,
})
  .extend(animalLocation)
  .extend(derivedAnimalFacts)
  .extend({
    primaryPhoto: AnimalPhotoSchema.nullable(),
    shelter: ShelterSummaryViewSchema,
    listingKind: FeedCardListingKindSchema,
  });
export type FeedCardView = z.infer<typeof FeedCardViewSchema>;

export const AnimalDetailViewSchema = ListedAnimalSchema.pick({
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  coatLength: true,
  description: true,
  photos: true,
  vaccination: true,
  spayNeuter: true,
  documentReadiness: true,
  temperament: true,
  colour: true,
  medicalNotes: true,
})
  .extend(animalLocation)
  .extend(derivedAnimalFacts)
  .extend({
    shelter: ShelterSummaryViewSchema,
  });
export type AnimalDetailView = z.infer<typeof AnimalDetailViewSchema>;
