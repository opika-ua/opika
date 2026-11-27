import { DEFAULT_GALLERY_SORT, NO_FILTERS } from "@opika/domain";
import { ukPublic as uk } from "@opika/i18n/public";
import { useId } from "react";
import { Heading } from "../../ui/Heading";
import { cardCityId } from "../gallery/card-text";
import type { CitySlugsById } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import type { SameShelterAnimals as SameShelterAnimalsView } from "./animal-page-load";

/** The cards' hrefs carry no filter, so the slug map is never consulted (as on the shelter page). */
const NO_CITY_SLUGS: CitySlugsById = new Map();

/**
 * The same shelter's other animals, as the gallery's own cards: plain links to `/tvaryny/{id}`,
 * which also lets a search engine walk from one animal to its shelter's others.
 */
export function SameShelterAnimals({ cards, cityNames }: SameShelterAnimalsView) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 max-desktop:pb-4">
      <Heading level={2} id={headingId}>
        {uk.sameShelter.heading}
      </Heading>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 desktop:grid-cols-4 desktop:gap-7.5">
        {cards.map((card) => (
          <li key={card.id} className="flex flex-col">
            <GalleryCard
              card={card}
              cityName={cityNames.get(cardCityId(card)) ?? null}
              layout="stacked"
              filters={NO_FILTERS}
              sort={DEFAULT_GALLERY_SORT}
              citySlugs={NO_CITY_SLUGS}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
