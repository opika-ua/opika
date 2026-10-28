import { NO_FILTERS } from "@opika/domain";
import type { MetadataRoute } from "next";
import { anonymousRouterClient } from "../api/server-client";
import { buildSitemapEntries } from "../seo/sitemap-entries";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";

/** Reads live listings, so never prerendered at build. */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await buildSitemapEntries(SITE_IS_PUBLICLY_DISCOVERABLE, {
    async animalPage(page) {
      const result = await anonymousRouterClient().gallery.list({
        filters: NO_FILTERS,
        sort: "freshest",
        page,
        pageSize: PAGE_SIZE,
        scope: { kind: "everyone" },
      });
      return {
        items: result.items.map((card) => ({ id: card.id, shelterId: card.shelter.id })),
        totalPages: result.totalPages,
      };
    },
  });
  return entries.map((entry) => ({ ...entry }));
}
