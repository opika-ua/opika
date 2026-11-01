import type { FeedFilters, GallerySort, ShelterId } from "@opika/domain";
import { ANY, NO_FILTERS } from "@opika/domain";
import {
  galleryPageHref,
  NO_PLACE_IDS,
  parseGalleryQuery,
  type SearchParams,
} from "../gallery/filter-url";

/** The shelter page's address (designer round 1, decision DR1-D2: by id, not a slug). */
export const shelterPagePath = (shelterId: ShelterId): string => `/prytulky/${shelterId}`;

/** Where the shelter page's list is: its sort, page and filters (the gallery's, minus place). */
export type ShelterPageQuery = { sort: GallerySort; page: number; filters: FeedFilters };

/**
 * The gallery's own parser, so every param means exactly what it means on `/tvaryny` and an invalid
 * value degrades the same way. Oblast and city params are dropped: one shelter has one place, and
 * the page shows no field for them.
 */
export function parseShelterPageQuery(searchParams: SearchParams): ShelterPageQuery {
  const { sort, page, filters } = parseGalleryQuery(searchParams, NO_PLACE_IDS);
  return { sort, page, filters: { ...filters, regions: ANY, cities: ANY } };
}

/**
 * A link within one shelter's page: the gallery's param names and its "the default is the absent
 * param" convention, so page 1 unfiltered in the default sort is the bare path. A sort or filter
 * link passes page 1: a new order or result set is a new list.
 */
export function shelterPageHref(
  shelterId: ShelterId,
  sort: GallerySort,
  page: number,
  filters: FeedFilters = NO_FILTERS,
): string {
  return galleryPageHref(filters, sort, page, new Map(), shelterPagePath(shelterId));
}
