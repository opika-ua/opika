import type { CityId } from "@opika/domain";
import { textIn } from "@opika/domain";
import type { Metadata } from "next";
import { anonymousRouterClient } from "../../../api/server-client";
import { DeckScreen } from "../../../features/discovery/DeckScreen";
import {
  filtersInWords,
  parseDeckQuery,
  type SearchParams,
} from "../../../features/gallery/filter-url";

/**
 * `/tvaryny` is the SEO surface (`docs/build-plan.md`'s F2 row owns its
 * metadata); a second indexable URL over the same animals — reached only
 * via a client-side mode switch, carrying state the gallery URL doesn't —
 * would compete with it rather than complement it. `docs/gallery-contract-
 * decisions.md` §6 already settled `/tvaryny/gortaty` as a static,
 * non-indexed sibling; this is that decision applied.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Same reasoning as `../page.tsx`: `force-dynamic` so a build-time
 * prerender never bakes in a snapshot of the seeded corpus.
 */
export const dynamic = "force-dynamic";

/**
 * A Server Component shell around `DeckScreen` (Client Component) for one
 * reason: `metadata` above requires it. Everything else here — resolving
 * city names for `filtersInWords` — could just as easily run in
 * `renderGallery`'s own Server Component, and does the same
 * `anonymousRouterClient().cities.list({})` call it does, independently.
 */
export default async function GortatyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { filters, total } = parseDeckQuery(await searchParams);

  const client = anonymousRouterClient();
  const cities = await client.cities.list({});
  const cityNames = new Map<CityId, string>(
    cities.map((city) => [city.id, textIn(city.name, "uk")]),
  );

  return (
    <DeckScreen filters={filters} total={total} filtersLabel={filtersInWords(filters, cityNames)} />
  );
}
