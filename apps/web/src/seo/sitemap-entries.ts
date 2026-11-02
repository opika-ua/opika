import { absoluteUrl } from "./json-ld-builders";

export type SitemapEntry = { readonly url: string; readonly lastModified?: Date };

/** The sitemap protocol allows 50,000 URLs per file. */
export const SITEMAP_URL_LIMIT = 50_000;

export const STATIC_SITEMAP_PATHS = ["/", "/tvaryny", "/pro", "/prytulkam"] as const;

export type SitemapSource = {
  /** Every public animal, in the gallery's order: ids with their shelter ids (one read, not a page loop). */
  readonly animals: () => Promise<readonly { readonly id: string; readonly shelterId: string }[]>;
};

/**
 * Empty while the site is not discoverable: no source is read at all. Shelter
 * URLs come from the animals' cards (no listing of shelters exists), so a
 * shelter with no visible animal is absent.
 */
export async function buildSitemapEntries(
  discoverable: boolean,
  source: SitemapSource,
): Promise<readonly SitemapEntry[]> {
  if (!discoverable) return [];
  const paths = new Set<string>(STATIC_SITEMAP_PATHS);
  const shelterPaths = new Set<string>();
  const animalPaths: string[] = [];
  for (const item of await source.animals()) {
    animalPaths.push(`/tvaryny/${item.id}`);
    shelterPaths.add(`/prytulky/${item.shelterId}`);
  }
  const all = [...paths, ...shelterPaths, ...animalPaths].slice(0, SITEMAP_URL_LIMIT);
  return all.map((path) => ({ url: absoluteUrl(path) }));
}
