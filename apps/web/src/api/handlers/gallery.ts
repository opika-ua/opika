import type {
  GalleryFacetCountsInputSchema,
  GalleryFacetCountsOutputSchema,
  GalleryListInputSchema,
  GalleryListOutputSchema,
  GalleryRelaxationCountsInputSchema,
  GalleryRelaxationCountsOutputSchema,
} from "@opika/contracts";
import { galleryRepo } from "@opika/db/repos";
import { ageBucketOf, canonicalizeFilters, primaryPhoto } from "@opika/domain";
import type { z } from "zod";
import type { AppContext } from "../context";
import { cityLabelOf } from "./city-labels";
import { discoverableListingKind } from "./discoverable-listing-kind";
import { listingFreshness } from "./listing-freshness";
import { cityOnlyLocationOf } from "./public-location";

type GalleryListInput = z.infer<typeof GalleryListInputSchema>;
type GalleryListOutput = z.infer<typeof GalleryListOutputSchema>;
type RelaxationInput = z.infer<typeof GalleryRelaxationCountsInputSchema>;
type RelaxationOutput = z.infer<typeof GalleryRelaxationCountsOutputSchema>;
type FacetCountsInput = z.infer<typeof GalleryFacetCountsInputSchema>;
type FacetCountsOutput = z.infer<typeof GalleryFacetCountsOutputSchema>;

/**
 * The gallery page, in the order the database returned it.
 *
 * Deliberately does *not* call `scoreAnimal`. The order is the product - the sort mode is named in the UI and in the
 * URL - and `scoreAnimal` is a function of freshness decay, so applying it
 * would reorder the same rows between two requests as `now` advanced. A page
 * someone shared would not reproduce what they saw, which is exactly what this
 * surface promises.
 *
 * Nothing is personalised, so this handler needs no adopter and the
 * response is identical for every visitor - which is what lets it be
 * server-rendered and crawled.
 */
export async function galleryList(
  input: GalleryListInput,
  context: AppContext,
): Promise<GalleryListOutput> {
  // One round trip for the page with each card's shelter and city (JOINs); the shelter count runs beside it.
  const page = await galleryRepo(context.db).listCards({
    // Deduped at the boundary: a filter list repeated thousands of times over
    // /api/rpc would otherwise reach SQL as thousands of predicates (review of #250).
    filters: canonicalizeFilters(input.filters),
    scope: input.scope,
    sort: input.sort,
    page: input.page,
    pageSize: input.pageSize,
    now: context.now,
  });

  const items = page.items.map(({ animal, shelter }) => ({
    id: animal.id,
    name: animal.name,
    species: animal.species,
    sex: animal.sex,
    size: animal.size,
    coatLength: animal.coatLength,
    publicLocation: animal.publicLocation && cityOnlyLocationOf(animal.publicLocation),
    ageBucket: ageBucketOf(animal.age, context.now),
    freshness: listingFreshness(animal.listing, context.now),
    primaryPhoto: primaryPhoto(animal),
    listingKind: discoverableListingKind(animal.listing),
    shelter: {
      id: shelter.id,
      displayName: shelter.displayName,
      logo: shelter.logo,
      publicLocation: cityOnlyLocationOf(shelter.publicLocation),
      verification: shelter.verification,
    },
  }));

  // The cards' cities, once each, in the order the cards first name them.
  const cities = new Map(
    page.items.flatMap(({ city }) => (city ? [[city.id, city] as const] : [])),
  );
  const cityLabels = [...cities.values()].map(cityLabelOf);

  return {
    items,
    cityLabels,
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
 * different query shape - one scan of conditional aggregates rather than a
 * page fetch.
 */
export async function galleryRelaxationCounts(
  input: RelaxationInput,
  context: AppContext,
): Promise<RelaxationOutput> {
  return galleryRepo(context.db).relaxationCounts({
    filters: input.filters,
    scope: input.scope,
    now: context.now,
  });
}

/**
 * The counts beside each option of the gallery's filter selectors. Read by the
 * page beside `gallery.list` (in parallel, server-side), so the counts arrive
 * with the HTML, work in the no-JS sheet, and need no fetch when a selector
 * opens. Option ids and integers only, picked field by field.
 */
export async function galleryFacetCounts(
  input: FacetCountsInput,
  context: AppContext,
): Promise<FacetCountsOutput> {
  // Deduped first: each of the statement's count columns repeats every other
  // filter, so a repeated value list multiplies there (review of #250, note 1).
  const counts = await galleryRepo(context.db).facetCounts({
    filters: canonicalizeFilters(input.filters),
    scope: input.scope,
    now: context.now,
  });
  return {
    cities: counts.cities.map(({ city, count }) => ({
      cityId: city.id,
      count,
      label: cityLabelOf(city),
    })),
    regions: counts.regions.map(({ regionId, count }) => ({ regionId, count })),
    ages: { ...counts.ages },
    sizes: { ...counts.sizes },
    sexes: { ...counts.sexes },
    species: { ...counts.species },
  };
}
