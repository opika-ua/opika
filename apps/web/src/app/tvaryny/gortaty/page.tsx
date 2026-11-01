import { placeName } from "@opika/i18n";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { anonymousRouterClient } from "../../../api/server-client";
import { DeckScreen } from "../../../features/discovery/DeckScreen";
import {
  cityTokensOf,
  filtersInWords,
  parseDeckQuery,
  redirectHrefForNonCanonicalCities,
  type SearchParams,
} from "../../../features/gallery/filter-url";
import { placeBookOf } from "../../../features/gallery/place-book";

/**
 * `docs/design/README.md`'s "Gallery ↔ deck" section decides this directly:
 * "`/tvaryny/gortaty` is the deck and is `noindex` — a viewing state, not a
 * page" — and "The deck is never the front door: it isn't indexable." Not
 * this comment's own call; the design doc is the authority, per
 * `docs/standing-constraints.md`.
 *
 * `docs/gallery-contract-decisions.md` §6 is a separate, narrower decision
 * - it settles `/tvaryny/gortaty` as a static *routing* sibling that cannot
 * collide with the dynamic `[animalId]` segment. An earlier version of this
 * comment cited §6 for the noindex fact too; §6 says nothing about
 * indexing, and the correction is recorded here rather than propagated a
 * third time.
 *
 * Deliberately independent of both `REGISTRY_HAS_NO_REAL_SHELTERS` and
 * `SITE_IS_PUBLICLY_DISCOVERABLE` (`src/seo-flags.ts`, Phase D) - this
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
 * reason: `metadata` above requires it. Everything else here - resolving
 * the URL's place tokens for `filtersInWords` - could just as easily run in
 * `renderGallery`'s own Server Component, and does the same resolution it does,
 * independently. No settlement list is read: the deck names a card's city from
 * the labels each `feed.list` page carries.
 */
export default async function GortatyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const client = anonymousRouterClient();

  // Same ordering as `../page.tsx`, same reason: a `?misto=` token is a slug (or a former slug,
  // or a legacy id) and resolving it needs a lookup before the URL can be parsed at all.
  const cityTokens = cityTokensOf(resolvedSearchParams);
  const [regions, resolutions] = await Promise.all([
    client.regions.list({}),
    cityTokens.length > 0 ? client.cities.resolveTokens({ tokens: cityTokens }) : [],
  ]);

  const legacyRedirect = redirectHrefForNonCanonicalCities(
    resolvedSearchParams,
    "/tvaryny/gortaty",
    resolutions,
  );
  if (legacyRedirect) permanentRedirect(legacyRedirect);

  const book = placeBookOf(regions, [], resolutions);
  const { filters, total } = parseDeckQuery(resolvedSearchParams, book.placeIds);
  const cityNames = new Map([...book.cities].map(([id, label]) => [id, placeName(label)] as const));
  const regionNames = new Map([...book.regions].map(([id, region]) => [id, region.label] as const));

  return (
    <DeckScreen
      filters={filters}
      total={total}
      filtersLabel={filtersInWords(filters, cityNames, regionNames)}
      citySlugs={book.slugs}
    />
  );
}
