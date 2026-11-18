import type { CityLabelView } from "@opika/contracts";
import { MAX_CITY_TOKEN_LENGTH } from "@opika/contracts/constants";
import type { AnimalSpecies } from "@opika/domain";
import { pageRefusalOf } from "../../api/page-refusal";
import { anonymousRouterClient } from "../../api/server-client";

/** The procedures the city page reads; a test passes a stub of just these. */
export type CityPageClient = Pick<ReturnType<typeof anonymousRouterClient>, "cities">;

/**
 * What `/tvaryny/misto/{slug}` can show (SEO B3). `moved`: a former slug of a city that has a
 * page, answered with a 308 to the current one. `not_found`: an unknown slug, a legacy id (never
 * a city page address), or a city with no listed animal of an indexable shelter (no thin pages).
 */
export type CityPageLoad =
  | { kind: "city"; city: CityLabelView; species: readonly AnimalSpecies[] }
  | { kind: "moved"; slug: string }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

export async function loadCityPage(
  slug: string,
  client: CityPageClient = anonymousRouterClient(),
): Promise<CityPageLoad> {
  if (slug.length === 0 || slug.length > MAX_CITY_TOKEN_LENGTH) return { kind: "not_found" };
  try {
    const [resolved] = await client.cities.resolveTokens({ tokens: [slug] });
    const city = resolved?.city;
    if (!city || resolved.via === "id") return { kind: "not_found" };
    const [page] = await client.cities.withPages({ ids: [city.id] });
    if (!page) return { kind: "not_found" };
    if (resolved.via === "alias") return { kind: "moved", slug: city.slug };
    return { kind: "city", city, species: page.species };
  } catch (error) {
    const refusal = pageRefusalOf(error);
    if (refusal) return { kind: refusal };
    throw error;
  }
}
