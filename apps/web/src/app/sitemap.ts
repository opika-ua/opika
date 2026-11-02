import { galleryRepo } from "@opika/db/repos";
import type { MetadataRoute } from "next";
import { getDb } from "../api/db";
import { buildSitemapEntries } from "../seo/sitemap-entries";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";

/** Reads live listings, so never prerendered at build. */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await buildSitemapEntries(SITE_IS_PUBLICLY_DISCOVERABLE, {
    animals: () => galleryRepo(getDb()).sitemapRows({ now: new Date() }),
  });
  return entries.map((entry) => ({ ...entry }));
}
