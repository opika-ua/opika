import type {
  GalleryListInputSchema,
  GalleryListOutputSchema,
  GalleryRelaxationCountsInputSchema,
  GalleryRelaxationCountsOutputSchema,
} from "@opika/contracts";
import { galleryRepo, shelterRepo } from "@opika/db/repos";
import { ageBucketOf, DEFAULT_FRESHNESS_POLICY, freshnessOf, primaryPhoto } from "@opika/domain";
import type { z } from "zod";
import type { AppContext } from "../context";
import { discoverableListingKind } from "./discoverable-listing-kind";

type GalleryListInput = z.infer<typeof GalleryListInputSchema>;
type GalleryListOutput = z.infer<typeof GalleryListOutputSchema>;
type RelaxationInput = z.infer<typeof GalleryRelaxationCountsInputSchema>;
type RelaxationOutput = z.infer<typeof GalleryRelaxationCountsOutputSchema>;

/**
 * The gallery page, in the order the database returned it.
 *
 * Deliberately does *not* call `scoreAnimal`, which `feed.list` does. That
 * re-ranking is the deck's bargain and a good one there: the deck shows one
 * card at a time and nobody can tell, or care, that the order was tuned.
 * Here the order is the product — the sort mode is named in the UI and in the
 * URL — and `scoreAnimal` is a function of freshness decay, so applying it
 * would reorder the same rows between two requests as `now` advanced. A page
 * someone shared would not reproduce what they saw, which is exactly what this
 * surface promises.
 *
 * No seen-set either: "Не зараз" hides an animal for the rest of a deck
 * session and never in the gallery, so this handler needs no adopter and the
 * response is identical for every visitor — which is what lets it be
 * server-rendered and crawled.
 */
export async function galleryList(
  input: GalleryListInput,
  context: AppContext,
): Promise<GalleryListOutput> {
  const page = await galleryRepo(context.db).list({
    filters: input.filters,
    sort: input.sort,
    page: input.page,
    pageSize: input.pageSize,
    now: context.now,
  });

  // One batch query for the page's shelters, not one per card.
  const shelterIds = [...new Set(page.items.map((animal) => animal.shelterId))];
  const shelterList = await shelterRepo(context.db).findByIds(shelterIds);
  const shelterMap = new Map(shelterList.map((shelter) => [shelter.id, shelter]));

  const items = page.items
    .map((animal) => {
      const shelter = shelterMap.get(animal.shelterId);
      // Unreachable through the predicate, which already restricts to
      // feed-visible shelters. Dropping the card is the honest response to it
      // happening anyway: a card with no shelter is not something to render.
      if (!shelter) return null;

      return {
        id: animal.id,
        name: animal.name,
        species: animal.species,
        sex: animal.sex,
        size: animal.size,
        publicLocation: animal.publicLocation,
        ageBucket: ageBucketOf(animal.age, context.now),
        freshness: freshnessOf(animal.lastUpdatedAt, context.now, DEFAULT_FRESHNESS_POLICY),
        primaryPhoto: primaryPhoto(animal),
        listingKind: discoverableListingKind(animal.listing),
        shelter: {
          id: shelter.id,
          displayName: shelter.displayName,
          publicLocation: shelter.publicLocation,
          freshnessSentence: shelter.freshnessSentence,
          verification:
            shelter.verification.status === "verified"
              ? ("verified" as const)
              : ("unverified" as const),
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    items,
    totalMatching: page.totalMatching,
    totalShelters: page.totalShelters,
    totalPages: page.totalPages,
    page: page.page,
  };
}

/**
 * The counts behind "Прибрати «розмір» (+11 тварин)".
 *
 * Its own procedure because it answers the question that only arises when
 * there is no page of results to carry an answer on, and because it is a
 * different query shape — one scan of conditional aggregates rather than a
 * page fetch.
 */
export async function galleryRelaxationCounts(
  input: RelaxationInput,
  context: AppContext,
): Promise<RelaxationOutput> {
  return galleryRepo(context.db).relaxationCounts({
    filters: input.filters,
    now: context.now,
  });
}
