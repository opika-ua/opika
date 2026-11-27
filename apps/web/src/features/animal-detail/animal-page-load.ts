import type {
  AnimalDetailView,
  FeedCardView,
  HomeFoundAnimalView,
  PublicShelterView,
} from "@opika/contracts";
import {
  type AnimalId,
  AnimalIdSchema,
  type CityId,
  DEFAULT_GALLERY_SORT,
  NO_FILTERS,
} from "@opika/domain";
import { placeName, placeText } from "@opika/i18n";
import { pageRefusalOf } from "../../api/page-refusal";
import { anonymousRouterClient } from "../../api/server-client";
import { GALLERY_PATH } from "../chrome/gallery-path";
import { cityPagePath, galleryHref } from "../gallery/filter-url";
import { placeBookOf } from "../gallery/place-book";

/** The procedures the animal page reads; a test passes a stub of just these. */
export type AnimalPageClient = Pick<
  ReturnType<typeof anonymousRouterClient>,
  "animals" | "shelters" | "cities" | "regions" | "gallery"
>;

/** How many of the same shelter's other animals the page shows. */
export const SAME_SHELTER_ANIMALS_MAX = 4;

/** The same shelter's other animals, as the gallery's cards, with the names of the cities they carry. */
export interface SameShelterAnimals {
  cards: readonly FeedCardView[];
  cityNames: ReadonlyMap<CityId, string>;
}

/** Everything `AnimalDetailScreen` is given except `now`, which is read at render. */
export interface AnimalPageView {
  animal: AnimalDetailView;
  shelter: PublicShelterView;
  /** The place as a title or a chip names it: the bare name, with its oblast where the name repeats. */
  cityName: string | null;
  /** The place as a meta line prints it («м. Бровари», «с. Миколаївка, Березівський р-н, Одеська обл.»). */
  cityPlace: string | null;
  /** The city's landing page when it has one, else null; the breadcrumb and the link use it. */
  cityPagePath: string | null;
  backToGalleryHref: string;
  /** Null when there are none to show, or when the page itself is not indexable. */
  sameShelter: SameShelterAnimals | null;
}

/**
 * What `/tvaryny/{id}` can show, for the full page and the gallery's
 * overlay alike (designer round 1, §2: one component, one loader, so the
 * overlay can't drift from the page).
 *
 * - `not_found`: `animals.byId` answers one `NOT_FOUND` for a missing,
 *   undiscoverable or unverified-shelter animal (deliberately not telling a
 *   real id from a guessed one), and a malformed id is the same dead end.
 * - `home_found`: an adoption less than 90 days old (owner, 2026-11-24), the calm «Уже вдома»
 *   state instead of the 404; nothing else is read for it.
 * - `rate_limited` (RL-F1): a refusal to answer is not an answer about the
 *   card. Oleksii, 2026-10-20: the rate-limited case "never shows «Це не
 *   помилка…»", which is the not-found copy.
 *
 * Any other failure is thrown, never turned into either state: a database
 * error saying «картки тут більше немає» would be just as false.
 */
export type AnimalPageLoad =
  | { kind: "animal"; view: AnimalPageView }
  | { kind: "home_found"; view: HomeFoundAnimalView }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

export async function loadAnimalPage(
  rawAnimalId: string,
  client: AnimalPageClient = anonymousRouterClient(),
): Promise<AnimalPageLoad> {
  const parsedId = AnimalIdSchema.safeParse(rawAnimalId);
  if (!parsedId.success) return { kind: "not_found" };

  try {
    const page = await client.animals.byId({ animalId: parsedId.data });
    if (page.kind === "home_found") return { kind: "home_found", view: page };
    const animal = page.animal;
    // The card's city is known from the animal view alone (its own city, else its shelter's), so
    // the shelter's page-only fields (`shelters.byId`, which answers NOT_FOUND if the shelter
    // stopped being verified between the calls) and the city are read together: two waits in all.
    const cityId = animal.publicLocation
      ? animal.publicLocation.cityId
      : animal.shelter.publicLocation.cityId;
    // One city by id, never the settlement list.
    const shelterRead = client.shelters.byId({ shelterId: animal.shelter.id });
    const siblingsRead = readSameShelterAnimals(client, animal);
    const restRead = Promise.all([
      client.regions.list({}),
      client.cities.byIds({ ids: [cityId] }),
      client.cities.withPages({ ids: [cityId] }),
    ]);
    // The shelter settles first so its NOT_FOUND wins over a failure of the city read beside it.
    restRead.catch(() => undefined);
    const shelter = await shelterRead;
    const [regions, found, pages] = await restRead;
    const sameShelter = await siblingsRead;
    const city = found.find((c) => c.id === cityId) ?? null;

    /**
     * O-12 (`docs/observations.md`): «← Усі тварини у Бровари» has to
     * actually return to Brovary, not the unfiltered gallery: the link's
     * own text is a claim about where it goes. Built through `galleryHref`,
     * the one URL scheme every city link uses, so it is the city's landing page when that exists
     * (SEO B3). The unfiltered gallery only when the city doesn't resolve (never expected: every
     * animal's location is a real city).
     */
    const hasCityPage = city !== null && pages.some((page) => page.cityId === city.id);
    const backToGalleryHref = city
      ? galleryHref(
          { ...NO_FILTERS, cities: { kind: "oneOf", values: [city.id] } },
          DEFAULT_GALLERY_SORT,
          placeBookOf(regions, [city], [], new Set(pages.map((page) => page.cityId))).slugs,
        )
      : GALLERY_PATH;

    return {
      kind: "animal",
      view: {
        animal,
        shelter,
        cityName: city ? placeName(city) : null,
        cityPlace: city ? placeText(city, "full") : null,
        cityPagePath: city && hasCityPage ? cityPagePath(city.slug) : null,
        backToGalleryHref,
        sameShelter,
      },
    };
  } catch (error) {
    const refusal = pageRefusalOf(error);
    if (refusal) return { kind: refusal };
    throw error;
  }
}

/**
 * Up to {@link SAME_SHELTER_ANIMALS_MAX} other animals the gallery lists for this animal's shelter
 * (`gallery.list` with the shelter scope, the same read and visibility as the shelter page).
 * That read also lists an early-listed shelter's animals, which are noindex and out of the sitemap,
 * so a noindex page (the same rule as `animalMetadataOf`) links none: every link here is to a page
 * a search engine may index. Never throws: a block of links is not worth failing the animal page.
 */
async function readSameShelterAnimals(
  client: AnimalPageClient,
  animal: AnimalDetailView,
): Promise<SameShelterAnimals | null> {
  if (animal.availability.kind === "paused") return null;
  if (animal.shelter.verification === "listed_before_verification") return null;
  try {
    // One more than the cap, so dropping this animal from its own list still leaves the cap.
    const list = await client.gallery.list({
      filters: NO_FILTERS,
      sort: DEFAULT_GALLERY_SORT,
      page: 1,
      pageSize: SAME_SHELTER_ANIMALS_MAX + 1,
      scope: { kind: "shelter", shelterId: animal.shelter.id },
    });
    const cards = otherAnimals(list.items, animal.id);
    if (cards.length === 0) return null;
    return {
      cards,
      cityNames: new Map(list.cityLabels.map((city) => [city.id, placeName(city)])),
    };
  } catch {
    return null;
  }
}

/** The listed cards without the open animal, at most {@link SAME_SHELTER_ANIMALS_MAX}. */
function otherAnimals(items: readonly FeedCardView[], currentId: AnimalId): FeedCardView[] {
  return items.filter((card) => card.id !== currentId).slice(0, SAME_SHELTER_ANIMALS_MAX);
}
