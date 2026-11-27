import { GALLERY_PATH } from "../features/chrome/gallery-path";
import { PRIVACY_PATH } from "../features/chrome/privacy-path";
import { cityPagePath } from "../features/gallery/filter-url";
import { absoluteUrl } from "./json-ld-builders";

export type SitemapEntry = { readonly url: string; readonly lastModified?: Date };

/** The sitemap protocol allows 50,000 URLs per file. */
export const SITEMAP_URL_LIMIT = 50_000;

/** The gallery is `/`; `/tvaryny` redirects there, and a sitemap lists only URLs that answer 200. */
export const STATIC_SITEMAP_PATHS = [GALLERY_PATH, "/pro", "/prytulkam", PRIVACY_PATH] as const;

export type SitemapSource = {
  /** Every public animal, in the gallery's order: ids with their shelter ids (one read, not a page loop). */
  readonly animals: () => Promise<readonly { readonly id: string; readonly shelterId: string }[]>;
  /** The cities with a landing page (SEO B3), each with its newest indexable animal's update. */
  readonly cities: () => Promise<readonly { readonly slug: string; readonly lastModified: Date }[]>;
};

/**
 * Empty while the site is not discoverable: no source is read at all. Shelter
 * URLs come from the animals' cards (no listing of shelters exists), so a
 * shelter with no visible animal is absent. City pages follow the static
 * pages, ahead of the long tail of animals the URL limit could cut.
 */
export async function buildSitemapEntries(
  discoverable: boolean,
  source: SitemapSource,
): Promise<readonly SitemapEntry[]> {
  if (!discoverable) return [];
  const [animals, cities] = await Promise.all([source.animals(), source.cities()]);
  const paths = new Set<string>(STATIC_SITEMAP_PATHS);
  const shelterPaths = new Set<string>();
  const animalPaths: string[] = [];
  for (const item of animals) {
    animalPaths.push(`/tvaryny/${item.id}`);
    shelterPaths.add(`/prytulky/${item.shelterId}`);
  }
  const cityEntries: SitemapEntry[] = cities.map((city) => ({
    url: absoluteUrl(cityPagePath(city.slug)),
    lastModified: city.lastModified,
  }));
  const all: SitemapEntry[] = [
    ...[...paths].map((path) => ({ url: absoluteUrl(path) })),
    ...cityEntries,
    ...[...shelterPaths, ...animalPaths].map((path) => ({ url: absoluteUrl(path) })),
  ];
  return all.slice(0, SITEMAP_URL_LIMIT);
}
