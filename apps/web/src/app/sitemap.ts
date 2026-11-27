import { galleryRepo } from "@opika/db/repos";
import { DEFAULT_GALLERY_SORT, NO_FILTERS } from "@opika/domain";
import type { MetadataRoute } from "next";
import { getDb } from "../api/db";
import { buildSitemapEntries } from "../seo/sitemap-entries";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";

/** Reads live listings, so never prerendered at build. */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries = await buildSitemapEntries(SITE_IS_PUBLICLY_DISCOVERABLE, {
    animals: () => galleryRepo(getDb()).sitemapRowsWithPhotos({ now }),
    cities: () => galleryRepo(getDb()).cityPages({ now }),
    speciesCounts: async () =>
      (
        await galleryRepo(getDb()).facetCounts({
          filters: NO_FILTERS,
          sort: DEFAULT_GALLERY_SORT,
          now,
        })
      ).indexableBySpecies,
    photoBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
  });
  // Next's type takes a mutable `images`; it emits the sitemap-image namespace and tags itself.
  return entries.map((entry) =>
    "images" in entry ? { url: entry.url, images: [...entry.images] } : { ...entry },
  );
}
