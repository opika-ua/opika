import type { GalleryFacetCounts } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import { placeName, uk } from "@opika/i18n";
import { Chip } from "../../ui/Chip";
import { Heading } from "../../ui/Heading";
import { cityPagePath } from "./filter-url";

export type CityLink = { readonly slug: string; readonly name: string };

const ukrainianOrder = new Intl.Collator("uk");

/**
 * The cities that have a landing page, in Ukrainian order, from the facet counts the page already
 * reads (`hasPage` is the sitemap's own rule). The city the page is about is left out: a link to
 * the page you are on adds nothing for a crawler or a reader.
 */
export function cityLinksOf(
  cities: GalleryFacetCounts["cities"],
  currentCityId?: CityId,
): readonly CityLink[] {
  return cities
    .filter((entry) => entry.hasPage && entry.cityId !== currentCityId)
    .map((entry) => ({ slug: entry.label.slug, name: placeName(entry.label) }))
    .sort((a, b) => ukrainianOrder.compare(a.name, b.name) || a.slug.localeCompare(b.slug));
}

/** Plain links to every city page: secondary navigation under the list, and crawlable (no JS needed). */
export function CityLinks({ cities }: { cities: readonly CityLink[] }) {
  if (cities.length === 0) return null;
  return (
    <nav
      aria-labelledby="city-links-heading"
      data-testid="city-links"
      className="flex flex-col gap-4"
    >
      <Heading level={2} id="city-links-heading">
        {uk.cityLinks.heading}
      </Heading>
      <ul className="flex flex-wrap gap-3">
        {cities.map((city) => (
          <li key={city.slug}>
            {/* No prefetch: dozens of cities in view would each fetch a page nobody asked for. */}
            <Chip kind="link" href={cityPagePath(city.slug)} prefetch={false}>
              {city.name}
            </Chip>
          </li>
        ))}
      </ul>
    </nav>
  );
}
