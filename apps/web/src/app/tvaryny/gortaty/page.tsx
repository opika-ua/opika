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
 * `docs/design/README.md`'s "Gallery ↔ deck" section decides this directly:
 * "`/tvaryny/gortaty` is the deck and is `noindex` — a viewing state, not a
 * page" — and "The deck is never the front door: it isn't indexable." Not
 * this comment's own call; the design doc is the authority, per
 * `docs/standing-constraints.md`.
 *
 * `docs/gallery-contract-decisions.md` §6 is a separate, narrower decision
 * — it settles `/tvaryny/gortaty` as a static *routing* sibling that cannot
 * collide with the dynamic `[animalId]` segment. An earlier version of this
 * comment cited §6 for the noindex fact too; §6 says nothing about
 * indexing, and the correction is recorded here rather than propagated a
 * third time.
 *
 * Deliberately independent of both `REGISTRY_HAS_NO_REAL_SHELTERS` and
 * `SITE_IS_PUBLICLY_DISCOVERABLE` (`src/seo-flags.ts`, Phase D) — this
 * route stays noindex under every combination of either, including once
 * the site is fully launched and publicly discoverable, because the reason
 * is the design doc's permanent SEO-ownership call above, not demo-corpus
 * honesty. Asserted in `seo-flags.test.ts`, which mocks all four
 * combinations: do not "simplify" this into reading either flag.
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
