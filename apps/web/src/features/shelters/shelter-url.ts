import type { GallerySort, ShelterId } from "@opika/domain";
import { DEFAULT_GALLERY_SORT } from "@opika/domain";
import { GALLERY_PARAM, parseGalleryQuery, type SearchParams } from "../gallery/filter-url";

/** The shelter page's address (designer round 1, decision DR1-D2: by id, not a slug). */
export const shelterPagePath = (shelterId: ShelterId): string => `/prytulky/${shelterId}`;

/** Where the shelter page's list is: its sort and page, nothing else (DR1-D3: no filters). */
export type ShelterPageQuery = { sort: GallerySort; page: number };

/** No city slugs: the shelter page parses no city, so nothing is ever looked up in this. */
const NO_CITIES = new Map();

/**
 * The gallery's own parser, so `?sort=` and `?stor=` mean exactly what they
 * mean on `/tvaryny` and an invalid value degrades the same way (default sort,
 * page 1). Any filter param in the URL is ignored: the shelter page has none.
 */
export function parseShelterPageQuery(searchParams: SearchParams): ShelterPageQuery {
  const { sort, page } = parseGalleryQuery(searchParams, NO_CITIES);
  return { sort, page };
}

/**
 * A link within one shelter's page: the gallery's param names and its
 * "the default is the absent param" convention, so page 1 in the default sort
 * is the bare path. A sort link passes page 1: a new order is a new list.
 */
export function shelterPageHref(shelterId: ShelterId, sort: GallerySort, page: number): string {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_GALLERY_SORT) params.set(GALLERY_PARAM.sort, sort);
  if (page > 1) params.set(GALLERY_PARAM.page, String(page));
  const qs = params.toString();
  return qs ? `${shelterPagePath(shelterId)}?${qs}` : shelterPagePath(shelterId);
}
