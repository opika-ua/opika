import { isRealPhotoKey, r2PublicUrl } from "@opika/db/image-pipeline";
import type { AnimalSpecies } from "@opika/domain";
import { GALLERY_PATH } from "../features/chrome/gallery-path";
import { PRIVACY_PATH } from "../features/chrome/privacy-path";
import { cityPagePath } from "../features/gallery/filter-url";
import { speciesPagePath, speciesWithPages } from "../features/gallery/species-pages";
import { SHELTERS_INDEX_PATH } from "../features/shelters/shelters-index-path";
import { absoluteUrl } from "./json-ld-builders";

/** A page entry, or an animal page with its photos (`<image:image>`); never an empty image list. */
export type SitemapEntry = PageSitemapEntry | ImageSitemapEntry;
export type PageSitemapEntry = { readonly url: string; readonly lastModified?: Date };
export type ImageSitemapEntry = {
  readonly url: string;
  readonly images: readonly [string, ...string[]];
};

/** The sitemap protocol allows 50,000 URLs per file. */
export const SITEMAP_URL_LIMIT = 50_000;

/** The gallery is `/`; `/tvaryny` redirects there, and a sitemap lists only URLs that answer 200. */
export const STATIC_SITEMAP_PATHS = [GALLERY_PATH, "/pro", "/prytulkam", PRIVACY_PATH] as const;

export type SitemapSource = {
  /** Every public animal, in the gallery's order: ids, shelter ids and stored photos (one read, not a page loop). */
  readonly animals: () => Promise<readonly SitemapAnimal[]>;
  /** The cities with a landing page (SEO B3), each with its newest indexable animal's update. */
  readonly cities: () => Promise<readonly { readonly slug: string; readonly lastModified: Date }[]>;
  /** `gallery.facetCounts`' `indexableBySpecies`, unfiltered: the species pages' threshold. */
  readonly speciesCounts: () => Promise<Readonly<Record<AnimalSpecies, number>>>;
  /** `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, the base the gallery's own photo URLs use. */
  readonly photoBaseUrl: string | undefined;
};

export type SitemapAnimal = {
  readonly id: string;
  readonly shelterId: string;
  readonly photos: readonly { readonly storageKey: string }[];
};

/**
 * The `detail` WebP of each real photo, in stored order. Seed keys have no R2 object, so they are
 * left out; without a base URL there is nothing to point at, and the page entries still ship.
 */
export function animalImageUrls(
  photos: SitemapAnimal["photos"],
  photoBaseUrl: string | undefined,
): readonly string[] {
  if (!photoBaseUrl) return [];
  return photos
    .filter((photo) => isRealPhotoKey(photo.storageKey))
    .map((photo) => r2PublicUrl(photoBaseUrl, photo.storageKey, "detail", "webp"));
}

/**
 * Empty while the site is not discoverable: no source is read at all. Shelter
 * URLs come from the animals' cards, so a shelter with no visible animal is
 * absent. `/prytulky` (the `shelters.listed` procedure) is held to the same basis by
 * `shelters-index-agreement.test.ts`, so it answers 200 exactly when an animal is listed here.
 * Species and city pages follow the static pages, ahead of the long tail of animals the URL
 * limit could cut; a species page has no lastmod (owner, 2026-11-27).
 */
export async function buildSitemapEntries(
  discoverable: boolean,
  source: SitemapSource,
): Promise<readonly SitemapEntry[]> {
  if (!discoverable) return [];
  const [animals, cities, speciesCounts] = await Promise.all([
    source.animals(),
    source.cities(),
    source.speciesCounts(),
  ]);
  const paths = new Set<string>(STATIC_SITEMAP_PATHS);
  if (animals.length > 0) paths.add(SHELTERS_INDEX_PATH);
  const shelterPaths = new Set<string>();
  const animalEntries: SitemapEntry[] = [];
  for (const item of animals) {
    const url = absoluteUrl(`/tvaryny/${item.id}`);
    const [first, ...rest] = animalImageUrls(item.photos, source.photoBaseUrl);
    animalEntries.push(first === undefined ? { url } : { url, images: [first, ...rest] });
    shelterPaths.add(`/prytulky/${item.shelterId}`);
  }
  const cityEntries: SitemapEntry[] = cities.map((city) => ({
    url: absoluteUrl(cityPagePath(city.slug)),
    lastModified: city.lastModified,
  }));
  const speciesEntries: SitemapEntry[] = [...speciesWithPages(speciesCounts)].map((species) => ({
    url: absoluteUrl(speciesPagePath(species)),
  }));
  const all: SitemapEntry[] = [
    ...[...paths].map((path) => ({ url: absoluteUrl(path) })),
    ...speciesEntries,
    ...cityEntries,
    ...[...shelterPaths].map((path) => ({ url: absoluteUrl(path) })),
    ...animalEntries,
  ];
  return all.slice(0, SITEMAP_URL_LIMIT);
}
