import type { AnimalId } from "@opika/domain";
import { anonymousRouterClient } from "../../api/server-client";
import { type AnimalPageClient, loadAnimalPage } from "../animal-detail/animal-page-load";
import {
  animalPageHref,
  cityTokensOf,
  parseGalleryQuery,
  type SearchParams,
} from "../gallery/filter-url";
import { placeBookOf } from "../gallery/place-book";
import type { OverlayNeighbour } from "./AnimalOverlay";

/**
 * Everything the gallery's overlay reads, in one go: the animal page's own loader and the
 * prev/next walk start together (neighbours need only the animal id, not the loaded animal), so
 * the overlay waits for the slower of the two, not their sum. A neighbours failure never fails
 * the overlay (non-critical): both sides fall back to `null`, as at a real end of the set. A
 * loader failure is `failed` and not thrown (from an overlay it must not reach the route's error
 * boundary, which would replace the gallery).
 */
export async function loadOverlayData(
  animalId: AnimalId,
  rawSearchParams: SearchParams,
  client: AnimalPageClient = anonymousRouterClient(),
): Promise<{
  load: Awaited<ReturnType<typeof loadAnimalPage>> | { kind: "failed" };
  neighbours: { prev: OverlayNeighbour; next: OverlayNeighbour };
}> {
  const [load, neighbours] = await Promise.all([
    loadAnimalPage(animalId, client).catch(() => ({ kind: "failed" as const })),
    neighboursOf(client, animalId, rawSearchParams),
  ]);
  return { load, neighbours };
}

/**
 * The gallery's current filter and sort, parsed from the same query scheme `animalPageHref` writes
 * it in, then `animals.neighbours` walks the identical result set `gallery.list` would. Its own
 * place lookup (the URL's city tokens through `cities.resolveTokens`, the 27 oblasts from
 * `regions.list`), since this route has no other reason to fetch places.
 */
async function neighboursOf(
  client: AnimalPageClient,
  animalId: AnimalId,
  rawSearchParams: SearchParams,
): Promise<{ prev: OverlayNeighbour; next: OverlayNeighbour }> {
  try {
    const cityTokens = cityTokensOf(rawSearchParams);
    const [regions, resolutions] = await Promise.all([
      client.regions.list({}),
      cityTokens.length > 0 ? client.cities.resolveTokens({ tokens: cityTokens }) : [],
    ]);
    const book = placeBookOf(regions, [], resolutions);
    const citySlugs = book.slugs;
    const { filters, sort } = parseGalleryQuery(rawSearchParams, book.placeIds);

    const { prev, next } = await client.animals.neighbours({ animalId, filters, sort });
    return {
      prev: prev
        ? { name: prev.name, href: animalPageHref(prev.id, filters, sort, citySlugs) }
        : null,
      next: next
        ? { name: next.name, href: animalPageHref(next.id, filters, sort, citySlugs) }
        : null,
    };
  } catch {
    return { prev: null, next: null };
  }
}
