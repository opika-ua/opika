import type { FeedFilters, RegionId } from "@opika/domain";
import { placeName, uk } from "@opika/i18n";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { anonymousRouterClient } from "../../api/server-client";
import { SITE_TITLE } from "../../brand";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { SiteHeader } from "../../features/chrome/SiteHeader";
import { ActiveFilterChips } from "../../features/gallery/ActiveFilterChips";
import { ArrowKeyGrid } from "../../features/gallery/ArrowKeyGrid";
import { activeFilterChips } from "../../features/gallery/active-filters";
import { cardCityId } from "../../features/gallery/card-text";
import { FilterSheet } from "../../features/gallery/FilterSheet";
import {
  cityTokensOf,
  parseGalleryQuery,
  redirectHrefForNonCanonicalCities,
  resetFiltersHref,
  type SearchParams,
} from "../../features/gallery/filter-url";
import { GalleryCard } from "../../features/gallery/GalleryCard";
import { GalleryControlBlock } from "../../features/gallery/GalleryControlBlock";
import {
  GalleryFilterDropdowns,
  SpeciesToggle,
} from "../../features/gallery/GalleryFilterDropdowns";
import { GalleryListEnd } from "../../features/gallery/GalleryListEnd";
import { GalleryPageNav } from "../../features/gallery/GalleryPageNav";
import { GallerySortToggle } from "../../features/gallery/GallerySortToggle";
import { railResultCount } from "../../features/gallery/gallery-copy";
import { hasPagination } from "../../features/gallery/gallery-pagination";
import { NoMatch } from "../../features/gallery/NoMatch";
import { OutOfRangeNotice } from "../../features/gallery/OutOfRangeNotice";
import { placeBookOf } from "../../features/gallery/place-book";
import { ReplaceNav } from "../../features/gallery/ReplaceNav";
import { throwIfGalleryTestFailure } from "../../features/gallery/test-only-failure";
import { Container } from "../../ui/Container";
import { cx } from "../../ui/cx";
import { Heading } from "../../ui/Heading";
import { MASCOT_RESERVE_CLASS, Mascot } from "../../ui/Mascot";
import { mascotKindFor } from "../../ui/mascot-species";
import { PerchedWords } from "../../ui/PerchedWords";

/**
 * Same reasoning as `../page.tsx`: without this, `next build` would try to
 * prerender the gallery at build time, which needs `DATABASE_URL` as a
 * build-time secret and would bake in a snapshot that goes stale the moment
 * a shelter's listing changes.
 */
export const dynamic = "force-dynamic";

/**
 * PR B, the SEO review of page titles. Before this the route had no metadata of its
 * own at all, so it inherited the root layout's `title.default` - which Next never
 * runs through `title.template`, so it rendered brand-first ("Opika - тварини...")
 * rather than subject-first. Setting an explicit `title` here (the same subject,
 * `SITE_TITLE`) is what gets it templated, producing "Собаки й коти з притулків
 * України – Opika".
 *
 * No `description` and no `openGraph` here, deliberately - found on review:
 * Next doesn't merge a child's `openGraph` into a parent's, it replaces the whole
 * object, so this page's own `openGraph: { type, description }` was silently dropping
 * the root layout's `siteName`/`locale` from every link preview of the gallery. The
 * root's own `description` (D-2's `linkPreviewDescription` ternary - `uk.demo.
 * bannerNotice` while `REGISTRY_HAS_NO_REAL_SHELTERS`, `uk.firstRun.promise` once real
 * shelters exist) and its `openGraph` (now carrying `title: titled(SITE_TITLE)`,
 * `brand.ts`) already say exactly what this page would have said by hand - the owner's
 * review of this PR's draft cut the longer description once proposed here down to
 * exactly `uk.firstRun.promise` ("remove «гортайте по одній» - the deck is off"), which
 * is what made the two identical in the first place. Leaving both unset here means
 * there's one definition of the non-demo link-preview sentence, not two that can drift.
 *
 * The gallery's own filter/sort/page query variants canonicalise here too (owner,
 * PR B): no `generateMetadata`, so this one static object answers every `?...` combo
 * identically, which is exactly what a single shared canonical needs.
 */
export const metadata: Metadata = {
  title: SITE_TITLE,
  alternates: { canonical: "/tvaryny" },
};

/**
 * Only the first card is the LCP image (preloaded, fetchpriority high). A second preload would
 * compete with it for a phone's bandwidth while off screen; the rest load lazily.
 */
const PRIORITY_CARD_COUNT = 1;

/**
 * E1's grid, E2's filters + sort, E3's numbered pagination.
 * `docs/build-plan.md`'s E2 row: "Filter and sort state in the URL —
 * shareable, back-button-correct"; its E3 row adds the `?stor=N` controls
 * below the grid and the skip link that reaches them without tabbing
 * through all 24 cards.
 *
 * The no-match state (V2, `docs/design/README.md` "Gallery states" > "No
 * match") is now built. E4 adds two more of this route's states: one error
 * state covering both a cold-visit failure and a failed page navigation
 * (`error.tsx` - see its own comment for why there is one, not the
 * design's stated two), and the out-of-range-page notice, below. A
 * loading state (L1/L2) was investigated and deliberately NOT built this
 * pass - Next's route-level `loading.tsx` convention forces every
 * response through Suspense/streaming, which broke the no-JS path
 * outright (real content stayed in a hidden template a no-JS browser
 * never swaps in - caught by this repo's own no-JS harness tests, not
 * guessed at). A correct version needs a client-driven pending indicator
 * that never touches server rendering, which is real new scope, not a
 * one-file addition - see the open question this phase's PR raises.
 * `docs/design/README.md`'s own
 * "Next-page error" frame is intentionally not consumed anywhere - its
 * note there explains why.
 *
 * No `FirstRunBand` here (below the header, above the mobile summary row and
 * the rail+grid row) - `docs/design/README.md:427`'s "01 First run" band was
 * built, then removed in Phase D (O-3, `docs/observations.md`): it duplicated
 * the filter rail and the result count, and delayed the content it sat
 * above. See that section's own amendment note for what survives
 * (`uk.firstRun.promise` as `og:description` only). `/` still redirects here
 * (`next.config.ts`) rather than serving its own route - a standalone `/`
 * page was tried first and reverted for contradicting the original spec.
 *
 * **Correction, 2026-09-10 - found by Oleksii, not by any test; a first
 * draft of this correction then had its own history wrong, found by the
 * reviewer.** `uk.firstRun.promise` survives as `og:description` *when real
 * shelters exist*; the D-2 demo disclosure (`uk.demo.bannerNotice`, this
 * page's `linkPreviewDescription` while `REGISTRY_HAS_NO_REAL_SHELTERS`)
 * survives the same way - and both `description`/`og:description` render
 * only in a shared-link preview or a search snippet, never in the page a
 * visitor actually opens. **Not what `FirstRunBand` used to show**, on
 * inspection of the deleted component itself (`git show`), not assumed:
 * that band rendered `firstRun.promise` + `firstRun.disclaimer`, two
 * different sentences, and its removal (O-3, unrelated reasons - duplicated
 * the filter rail, delayed the content) is not what left `bannerNotice`
 * invisible here. `bannerNotice` was *never* rendered in this page's body,
 * at any point in this repo's history - only in metadata, always. The
 * deck (`DeckScreen.tsx`) shows "Демо" in its own header; this route, the
 * higher-traffic one, showed nothing at all. Fixed below: the same
 * already-approved `bannerNotice` sentence, rendered visibly for the first
 * time, directly under the header - not the slot `FirstRunBand` used to
 * occupy (that band sat *inside* the padded `max-w-[760px] mx-auto mb-8`
 * container below; this banner sits outside and above it). New placement of
 * existing copy, not a restoration and not new copy either.
 *
 * Split from the default export so `page.test.tsx` can call this directly
 * with a test database; `Page`'s own call below still calls it with Next's
 * real `{ searchParams }` so the two call signatures never collide.
 */
export async function renderGallery(
  client: ReturnType<typeof anonymousRouterClient> = anonymousRouterClient(),
  rawSearchParams: SearchParams = {},
  // Defaulted (not read from `cookies()` in here) so every existing direct
  // call in `page.test.tsx` keeps working without a real Next.js request
  // scope, which `cookies()` requires and a plain vitest render doesn't
  // have; `cookies()` itself throws outside one ("called outside a request
  // scope"), caught by running this suite, not inferred. `Page` below is
  // the one real caller and always computes the real value.
  kabinetSignedIn = false,
) {
  /**
   * The URL's place tokens are resolved before it can be parsed: an oblast slug against the 27
   * regions (a constant, no query), a city token through `cities.resolveTokens` (a current slug, a
   * former slug or a legacy id, only when `misto` is present). The page never reads a settlement
   * list: with every settlement imported it would be ~30k rows. Everything else the page names
   * comes back with its own responses (the cards' cities, the cities that have an animal).
   */
  const cityTokens = cityTokensOf(rawSearchParams);
  const [regions, resolutions] = await Promise.all([
    client.regions.list({}),
    cityTokens.length > 0 ? client.cities.resolveTokens({ tokens: cityTokens }) : [],
  ]);

  const legacyRedirect = redirectHrefForNonCanonicalCities(
    rawSearchParams,
    "/tvaryny",
    resolutions,
  );
  if (legacyRedirect) permanentRedirect(legacyRedirect);

  const {
    filters,
    sort,
    page: pageNumber,
  } = parseGalleryQuery(rawSearchParams, placeBookOf(regions, [], resolutions).placeIds);
  // The selectors' counts ride with the page rather than a fetch when a selector opens: one
  // grouped scan, in parallel with the page's own, so they cost no extra wait and reach the
  // no-JS sheet too (measured and argued in the filter selectors PR).
  const [page, facetCounts] = await Promise.all([
    client.gallery.list({ filters, sort, page: pageNumber }),
    client.gallery.facetCounts({ filters }),
  ]);

  // Labels for every link the page writes: the cities with an animal (the filter's options), the
  // cards' cities, and the cities the URL names (which may have no animal).
  const selectedCities = resolutions.flatMap(({ city }) => (city ? [city] : []));
  const book = placeBookOf(
    regions,
    [...facetCounts.cities.map((entry) => entry.label), ...page.cityLabels],
    resolutions,
  );
  const citySlugs = book.slugs;
  const cityNames = new Map([...book.cities].map(([id, label]) => [id, placeName(label)] as const));
  // The oblast filter always lists all 27 (one with no animal is shown disabled).
  const regionLabels: Record<string, string> = Object.fromEntries(
    [...book.regions].map(([id, region]) => [id, region.label]),
  );

  /**
   * docs/design/README.md, "Gallery states" > "No match". Only queried when
   * there's actually nothing to show - `gallery.relaxationCounts` is its
   * own scan (`packages/contracts/src/procedures/gallery.ts`: "a single
   * scan with one COUNT(*) FILTER per constrained dimension, not a reuse of
   * the page fetch"), so a normal, matching page never pays for it.
   */
  const relaxations =
    page.totalMatching === 0
      ? (await client.gallery.relaxationCounts({ filters })).relaxations
      : [];
  const neighbourRegions =
    page.totalMatching === 0 ? neighbourRegionsOf(filters.regions, book, facetCounts.regions) : [];

  const mascotKind = mascotKindFor(filters.species);

  return (
    <div className="min-h-dvh bg-page">
      {/*
        gallery-v3 (Figma `euz4JGfpToY31VJY7ppVj9`, node `58:1617`): the
        header is in the frame and is re-skinned in `SiteHeader.tsx` itself
        (shared across every route) rather than here, so it's called with no
        children on this route. The deck entry link that used to live in the
        header's trailing slot is gone from this page entirely - Oleksii,
        mid-build: "let's hide access to Гортати по одній page for now as
        well." It was never in the Figma frame to begin with.
      */}
      <SiteHeader wordmarkIsCurrentPage kabinetSignedIn={kabinetSignedIn} />

      {/*
        The visible D-2 demo disclosure banner that used to render here
        (`uk.demo.bannerNotice`, `gallery-demo-banner`, gated on
        `REGISTRY_HAS_NO_REAL_SHELTERS`) is removed from this page -
        Oleksii, mid-build, verbatim: "remove На сайті поки немає справжніх
        притулків - усі картки тут демонстраційні. as we hide our app
        anyways and people without gate cant access it ye[t]." The
        `og:description`/`description` metadata swap this file's own top
        comment (2026-09-10 correction) describes lives in the root
        `app/layout.tsx`, not here, and is untouched - a link-preview
        concern, not a banner a gated visitor sees in the page body.
      */}

      {/*
        Main, max-width 1400 centred - the frame's own number. 56px side
        gutters (`px-14`) below `desktop:` reuse `SiteHeader`'s own gutter
        (that component's top comment explains why: the frame states it for
        the header and nothing for the main content, so this PR reuses the
        header's number for a consistent column edge - confirmed self-
        consistent in `GalleryCard.tsx`'s own `SIZES` derivation, which
        reaches exactly 1512px, the frame's stated width, as the point the
        1400 cap starts to bind). 40px below the header (`pt-10`) is the
        frame's own number too. Below `desktop:`, this PR keeps the page's
        pre-existing padding (`px-4`/`px-6`) - "below 1024px... keep the
        existing column counts and breakpoints."
      */}
      <Container className="pt-10 pb-10 desktop:pb-14">
        {/* 52px from `desktop:` (the frame's own number); 32px on a phone so four cards fit the first screen. */}
        <div className="flex flex-col gap-8 desktop:gap-13">
          {/*
            «Фільтр» toggles row 2 (the dropdowns + sort) open/closed at
            desktop - see `GalleryControlBlock.tsx`'s own comment for that
            and for the option-B mobile row (species full width, then
            `FilterSheet`'s trigger + sort) below 1024px.
          */}
          <GalleryControlBlock
            // `min-w-0 break-words` on the h1 below: "Шукають дім" (two
            // words, 333px for "Шукають" alone) is a flex item in row 1,
            // which still shares that row with the desktop-only «Фільтр»
            // toggle button at >=1024px (plenty of room there) - a flex
            // item's default `min-width: auto` would otherwise floor it at
            // its own min-content size. Below 1024px `trailing` has moved
            // out of row 1 into the new mobile row below, so the title has
            // the row to itself there; `min-w-0`/`break-words` stay as a
            // defensive floor either way.
            title={
              // The mascot sits on the title only while there are cards: the no-match block has its own.
              <div className="tablet:mt-2">
                <Heading
                  level={1}
                  look="display-l"
                  className={cx(
                    "min-w-0 break-words tablet:text-display-xl",
                    page.totalMatching > 0 && MASCOT_RESERVE_CLASS[48],
                  )}
                >
                  {page.totalMatching > 0 ? (
                    <PerchedWords
                      text={uk.feed.galleryTitle}
                      mascot={<Mascot kind={mascotKind} pose="lie" size={48} perch="word" />}
                    />
                  ) : (
                    uk.feed.galleryTitle
                  )}
                </Heading>
              </div>
            }
            trailing={
              // Oleksii, mid-build: "let's hide access to Гортати по одній
              // page for now as well" — the deck entry link (never in the
              // Figma frame to begin with, flagged there for the owner and
              // designer) is removed from this row entirely, not merely
              // restyled. The deck route itself (`/tvaryny/gortaty`) still
              // exists and still reads its own filters/total from the URL;
              // only this page's own link to it is gone - `deckEntryHref`
              // and `DeckEntryLink` are no longer imported here at all.
              <FilterSheet
                filters={filters}
                sort={sort}
                placeIds={book.placeIds}
                citySlugs={citySlugs}
                regionLabels={regionLabels}
                selectedCities={selectedCities}
                resultCount={page.totalMatching}
                counts={facetCounts}
              />
            }
            mobileSpecies={
              <ReplaceNav>
                <SpeciesToggle
                  filters={filters}
                  sort={sort}
                  citySlugs={citySlugs}
                  className="w-full"
                  testIdSuffix="-mobile"
                />
              </ReplaceNav>
            }
            mobileSort={
              <ReplaceNav>
                <GallerySortToggle filters={filters} sort={sort} citySlugs={citySlugs} />
              </ReplaceNav>
            }
            mobileChips={
              <ReplaceNav>
                <ActiveFilterChips
                  chips={activeFilterChips({
                    filters,
                    sort,
                    citySlugs,
                    regionLabels,
                    selectedCities,
                    counts: facetCounts,
                  })}
                  resetHref={resetFiltersHref(sort)}
                />
              </ReplaceNav>
            }
            mobileCount={
              <p aria-hidden="true" className="text-label text-ink-2">
                {railResultCount(page.totalMatching, page.totalShelters)}
              </p>
            }
          >
            <ReplaceNav>
              <GalleryFilterDropdowns
                filters={filters}
                sort={sort}
                citySlugs={citySlugs}
                regionLabels={regionLabels}
                selectedCities={selectedCities}
                counts={facetCounts}
              />
            </ReplaceNav>
            <ReplaceNav>
              <GallerySortToggle filters={filters} sort={sort} citySlugs={citySlugs} />
            </ReplaceNav>
          </GalleryControlBlock>

          {/*
            "«Знайдено…» isn't in the frame. Keep it as a visually hidden
            live region; don't delete it." `position: absolute` (Tailwind's
            `sr-only`) takes this out of the flex flow entirely, so it costs
            no `gap-13` slot of its own.
          */}
          <span className="sr-only" aria-live="polite">
            {railResultCount(page.totalMatching, page.totalShelters)}
          </span>

          {/*
            Dropping E2.5's roving tabindex (docs/build-plan.md's E2.5 row)
            means every card is a real Tab stop - 24 of them - so the skip
            link below is the shortcut past them to "next page," not
            decoration. Only rendered when GalleryPageNav itself will be,
            through the same `hasPagination` both sides read: a skip link to
            an id that isn't on the page goes nowhere.
            `sr-only focus:not-sr-only`: invisible until a keyboard user
            actually reaches it by Tab, which is exactly who needs it.
          */}
          {page.totalMatching === 0 ? (
            <NoMatch
              filters={filters}
              sort={sort}
              citySlugs={citySlugs}
              relaxations={relaxations}
              neighbourRegions={neighbourRegions}
              regionEmpty={regionHoldsNoAnimals(filters, facetCounts.regions)}
            />
          ) : (
            <>
              {/*
                E4, docs/design/README.md's "Out-of-range page (P1/P2)":
                `pageNumber` is what was requested (parseGalleryQuery,
                unclamped beyond 1); `page.page` is what gallery.list
                actually resolved and served (E0's clamp). They differ only
                when the requested page was beyond `totalPages` but within
                `MAX_GALLERY_PAGE` - anything past that ceiling fails oRPC's
                own input validation before this component ever renders,
                and is caught by error.tsx instead.
              */}
              {pageNumber !== page.page && (
                <OutOfRangeNotice
                  requestedPage={pageNumber}
                  totalPages={page.totalPages}
                  filters={filters}
                  sort={sort}
                  citySlugs={citySlugs}
                />
              )}

              {hasPagination(page.totalPages) && (
                <a
                  href="#pagination"
                  data-testid="pagination-skip-link"
                  className="sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:min-h-target focus:items-center focus:rounded-pill focus:bg-ink focus:px-4 focus:text-label focus:text-on-ink focus-ring"
                >
                  {uk.pagination.skipLink}
                </a>
              )}

              {/* 2 columns on phones (12px/16px gaps) and tablets, 4 from `desktop:` (gap 30); the page wrapper caps content at 1400. */}
              <ArrowKeyGrid className="grid grid-cols-2 gap-x-3 gap-y-4 tablet:gap-4 desktop:grid-cols-4 desktop:gap-7.5">
                {page.items.map((item, index) => (
                  <GalleryCard
                    key={item.id}
                    card={item}
                    cityName={cityNames.get(cardCityId(item)) ?? null}
                    priority={index < PRIORITY_CARD_COUNT}
                    filters={filters}
                    sort={sort}
                    citySlugs={citySlugs}
                  />
                ))}
              </ArrowKeyGrid>

              <GalleryPageNav
                filters={filters}
                sort={sort}
                citySlugs={citySlugs}
                page={page.page}
                totalPages={page.totalPages}
              />

              {/* Only a paginated list has a "last page"; a single page keeps the hero's mascot alone on screen. */}
              {page.totalPages > 1 && page.page === page.totalPages && (
                <GalleryListEnd mascotKind={mascotKind} />
              )}
            </>
          )}
        </div>
      </Container>
    </div>
  );
}

/**
 * Up to three next-door oblasts of the chosen ones that have animals under the other filters,
 * most first. The facet counts' location count ignores the chosen oblasts and cities, so it is
 * the right number for "what would you see there". Chosen oblasts are never suggested back.
 */
function neighbourRegionsOf(
  chosen: FeedFilters["regions"],
  book: ReturnType<typeof placeBookOf>,
  counts: readonly { regionId: RegionId; count: number }[],
) {
  if (chosen.kind === "any") return [];
  const countOf = new Map(counts.map((entry) => [entry.regionId, entry.count]));
  const candidates = new Set<RegionId>();
  for (const id of chosen.values) {
    for (const neighbour of book.regions.get(id)?.neighbours ?? []) candidates.add(neighbour);
  }
  for (const id of chosen.values) candidates.delete(id);
  return [...candidates]
    .map((id) => ({ id, label: book.regions.get(id)?.label ?? "", count: countOf.get(id) ?? 0 }))
    .filter((entry) => entry.count > 0 && entry.label !== "")
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk"))
    .slice(0, 3);
}

/**
 * True when the chosen oblasts have no animal at all: an oblast is chosen, nothing else is, and
 * each chosen oblast has no row (or a zero count) in the facet counts. With any other filter set
 * a zero only means "none matching these filters", which the sentence would overstate.
 */
function regionHoldsNoAnimals(
  filters: FeedFilters,
  counts: readonly { regionId: RegionId; count: number }[],
): boolean {
  if (filters.regions.kind !== "oneOf") return false;
  const othersAny = (["cities", "species", "sizes", "ages", "sexes"] as const).every(
    (dimension) => filters[dimension].kind === "any",
  );
  if (!othersAny) return false;
  const countOf = new Map(counts.map((entry) => [entry.regionId, entry.count]));
  return filters.regions.values.every((id) => (countOf.get(id) ?? 0) === 0);
}

/** Server Component. Next.js calls this with `{ searchParams }` - a Promise, per Next 16's App Router contract. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [rawSearchParams, kabinetSignedIn] = await Promise.all([
    searchParams,
    kabinetSessionCookiePresent(),
  ]);
  throwIfGalleryTestFailure(process.env, rawSearchParams);
  return renderGallery(anonymousRouterClient(), rawSearchParams, kabinetSignedIn);
}
