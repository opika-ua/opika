import type { PublicShelterView } from "@opika/contracts";
import { type CityId, NO_FILTERS, ShelterIdSchema, textIn } from "@opika/domain";
import { pageRefusalOf } from "../../api/page-refusal";
import { anonymousRouterClient } from "../../api/server-client";
import type { ShelterPageQuery } from "./shelter-url";

/** The procedures the shelter page reads; a test passes a stub of just these. */
export type ShelterPageClient = Pick<
  ReturnType<typeof anonymousRouterClient>,
  "shelters" | "gallery" | "cities"
>;

/** Everything `ShelterPageScreen` is given. */
export interface ShelterPageView {
  shelter: PublicShelterView;
  /** The shelter's city, by name; null only if its id isn't in `cities.list`. */
  cityName: string | null;
  /** One page of the shelter's discoverable animals, in the requested date sort. */
  animals: Awaited<ReturnType<ShelterPageClient["gallery"]["list"]>>;
  /** Card city names (a fostered animal's city can differ from the shelter's). */
  cityNames: ReadonlyMap<CityId, string>;
  query: ShelterPageQuery;
}

/**
 * What `/prytulky/{id}` can show (designer round 1, S6), the animal page's
 * three outcomes (`animal-page-load.ts`):
 *
 * - `not_found`: `shelters.byId` answers one `NOT_FOUND` for an unknown id
 *   and for a shelter that isn't verified (pending, rejected, suspended,
 *   paused), deliberately not telling them apart; a malformed id is the
 *   same dead end.
 * - `rate_limited` (RL-F1): a refusal to answer is not an answer about the
 *   shelter, so it never shows the not-found page.
 *
 * Any other failure is thrown, to the route's error boundary.
 */
export type ShelterPageLoad =
  | { kind: "shelter"; view: ShelterPageView }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

export async function loadShelterPage(
  rawShelterId: string,
  query: ShelterPageQuery,
  client: ShelterPageClient = anonymousRouterClient(),
): Promise<ShelterPageLoad> {
  const parsedId = ShelterIdSchema.safeParse(rawShelterId);
  if (!parsedId.success) return { kind: "not_found" };
  const shelterId = parsedId.data;

  try {
    // The shelter first: its NOT_FOUND decides the page before any list is
    // read. The scoped list would answer an empty page for the same shelter
    // anyway (S5, DR1-S5-T5), but a 404 must not depend on that.
    const shelter = await client.shelters.byId({ shelterId });
    const [animals, cities] = await Promise.all([
      client.gallery.list({
        filters: NO_FILTERS,
        sort: query.sort,
        page: query.page,
        scope: { kind: "shelter", shelterId },
      }),
      client.cities.list({}),
    ]);
    const cityNames = new Map<CityId, string>(
      cities.map((city) => [city.id, textIn(city.name, "uk")]),
    );
    return {
      kind: "shelter",
      view: {
        shelter,
        cityName: cityNames.get(shelter.publicLocation.cityId) ?? null,
        animals,
        cityNames,
        query,
      },
    };
  } catch (error) {
    const refusal = pageRefusalOf(error);
    if (refusal) return { kind: refusal };
    throw error;
  }
}
