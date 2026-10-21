import type { AnimalDetailView, PublicShelterView } from "@opika/contracts";
import { AnimalIdSchema, DEFAULT_GALLERY_SORT, NO_FILTERS, textIn } from "@opika/domain";
import { pageRefusalOf } from "../../api/page-refusal";
import { anonymousRouterClient } from "../../api/server-client";
import { galleryHref } from "../gallery/filter-url";

/** The procedures the animal page reads; a test passes a stub of just these. */
export type AnimalPageClient = Pick<
  ReturnType<typeof anonymousRouterClient>,
  "animals" | "shelters" | "cities"
>;

/** Everything `AnimalDetailScreen` is given except `now`, which is read at render. */
export interface AnimalPageView {
  animal: AnimalDetailView;
  shelter: PublicShelterView;
  cityName: string | null;
  backToGalleryHref: string;
}

/**
 * What `/tvaryny/{id}` can show, for the full page and the gallery's
 * overlay alike (designer round 1, §2: one component, one loader, so the
 * overlay can't drift from the page).
 *
 * - `not_found`: `animals.byId` answers one `NOT_FOUND` for a missing,
 *   undiscoverable or unverified-shelter animal (deliberately not telling a
 *   real id from a guessed one), and a malformed id is the same dead end.
 * - `rate_limited` (RL-F1): a refusal to answer is not an answer about the
 *   card. Oleksii, 2026-10-20: the rate-limited case "never shows «Це не
 *   помилка…»", which is the not-found copy.
 *
 * Any other failure is thrown, never turned into either state: a database
 * error saying «картки тут більше немає» would be just as false.
 */
export type AnimalPageLoad =
  | { kind: "animal"; view: AnimalPageView }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

export async function loadAnimalPage(
  rawAnimalId: string,
  client: AnimalPageClient = anonymousRouterClient(),
): Promise<AnimalPageLoad> {
  const parsedId = AnimalIdSchema.safeParse(rawAnimalId);
  if (!parsedId.success) return { kind: "not_found" };

  try {
    const [animal, cities] = await Promise.all([
      client.animals.byId({ animalId: parsedId.data }),
      client.cities.list({}),
    ]);
    // `shelters.byId` answers NOT_FOUND when the shelter stopped being
    // verified between the two calls; the card is then gone for the same
    // reason `animals.byId` would have said so a moment later.
    const shelter = await client.shelters.byId({ shelterId: animal.shelter.id });

    const cityId = animal.publicLocation
      ? animal.publicLocation.cityId
      : shelter.publicLocation.cityId;
    const city = cities.find((c) => c.id === cityId) ?? null;

    /**
     * O-12 (`docs/observations.md`): «← Усі тварини у Бровари» has to
     * actually return to Brovary, not the unfiltered gallery: the link's
     * own text is a claim about where it goes. Built through `galleryHref`,
     * the one URL scheme every city link uses. `/tvaryny` unfiltered only
     * when the city isn't in `cities.list` (never expected: every animal's
     * location resolves to a real seeded city).
     */
    const citySlugs = new Map(cities.map((c) => [c.id, c.slug]));
    const backToGalleryHref = city
      ? galleryHref(
          { ...NO_FILTERS, cities: { kind: "oneOf", values: [city.id] } },
          DEFAULT_GALLERY_SORT,
          citySlugs,
        )
      : "/tvaryny";

    return {
      kind: "animal",
      view: {
        animal,
        shelter,
        cityName: city ? textIn(city.name, "uk") : null,
        backToGalleryHref,
      },
    };
  } catch (error) {
    const refusal = pageRefusalOf(error);
    if (refusal) return { kind: refusal };
    throw error;
  }
}
