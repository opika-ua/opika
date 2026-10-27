import type { CityId } from "@opika/domain";
import { textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { anonymousRouterClient } from "../../api/server-client";
import { SITE_TITLE } from "../../brand";
import { kabinetSessionCookiePresent } from "../../features/chrome/kabinet-signed-in";
import { SiteHeader } from "../../features/chrome/SiteHeader";
import { ArrowKeyGrid } from "../../features/gallery/ArrowKeyGrid";
import { cardCityId } from "../../features/gallery/card-text";
import { FilterSheet } from "../../features/gallery/FilterSheet";
import {
  parseGalleryQuery,
  redirectHrefForLegacyCityIds,
  type SearchParams,
} from "../../features/gallery/filter-url";
import { GalleryCard } from "../../features/gallery/GalleryCard";
import { GalleryControlBlock } from "../../features/gallery/GalleryControlBlock";
import { GalleryFilterDropdowns } from "../../features/gallery/GalleryFilterDropdowns";
import { GalleryPageNav } from "../../features/gallery/GalleryPageNav";
import { GallerySortToggle } from "../../features/gallery/GallerySortToggle";
import { railResultCount } from "../../features/gallery/gallery-copy";
import { hasPagination } from "../../features/gallery/gallery-pagination";
import { NoMatch } from "../../features/gallery/NoMatch";
import { OutOfRangeNotice } from "../../features/gallery/OutOfRangeNotice";
import { ReplaceNav } from "../../features/gallery/ReplaceNav";

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
 * Київщини – Opika".
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
 * Not the `wide` breakpoint's column count (4) - that was tried first and
 * rejected on review: at a 360px phone (1 column), it means 3 of the 4
 * "priority" preloads compete with the real LCP image for bandwidth on
 * exactly the audience (Ukrainian mobile, carrier networks) this matters
 * most for, while nothing is even on screen to show for two of them. `2` is
 * the tablet breakpoint's column count - still 1 wasted preload at phone
 * width (unavoidable without threading the breakpoint into this Server
 * Component), but half the waste this had before, and exactly right at
 * tablet and a reasonable partial win at desktop/wide.
 */
const PRIORITY_ROW_SIZE = 2;

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
   * Cities have to be fetched before the URL can be parsed at all now - a
   * city token in `?misto=` is a slug, and resolving a slug to a `CityId`
   * needs the real city list, not just a shape check the way a raw UUID
   * did. This costs the parallel `Promise.all` with `gallery.list` this file
   * used to have (O-6/O-12, `docs/build-plan.md`'s Phase S) - a real,
   * accepted latency tradeoff: `cities.list` is an 8-row, unfiltered table
   * scan, not a cost in the same league as the O-9 work this follows.
   */
  const cities = await client.cities.list({});
  const cityList = cities.map((city) => ({
    id: city.id,
    slug: city.slug,
    name: textIn(city.name, "uk"),
  }));
  const cityNames = new Map<CityId, string>(cityList.map((city) => [city.id, city.name]));
  const citySlugs = new Map(cityList.map((city) => [city.id, city.slug]));
  const citiesBySlug = new Map(cityList.map((city) => [city.slug, city.id]));

  const legacyRedirect = redirectHrefForLegacyCityIds(rawSearchParams, "/tvaryny", citySlugs);
  if (legacyRedirect) permanentRedirect(legacyRedirect);

  const { filters, sort, page: pageNumber } = parseGalleryQuery(rawSearchParams, citiesBySlug);
  const page = await client.gallery.list({ filters, sort, page: pageNumber });

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

  return (
    <div className="font-brand-ui min-h-dvh bg-brand-page">
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
      <div className="mx-auto max-w-[1400px] px-4 tablet:px-6 desktop:px-14 pt-10 desktop:pb-14 pb-10">
        {/* 52px between the control block, the grid and the pagination - the frame's own number. */}
        <div className="flex flex-col gap-13">
          {/*
            «Фільтр» toggles row 2 (the dropdowns + sort) open/closed -
            designer clarification mid-build, not the generic hand-off's
            "opens the sheet" instruction. See `GalleryControlBlock.tsx`'s
            own comment. Desktop only for now (no mobile Figma section yet):
            `FilterSheet` - the sole `trailing` content now the deck entry
            link is gone - keeps its own pre-existing `desktop:hidden`
            trigger for mobile/tablet, unchanged by this PR.
          */}
          <GalleryControlBlock
            // `min-w-0 break-words` on the h1 below: the heading's text
            // changed from "Каталог" (one word, 288px, never wraps) to
            // "Шукають дім" (Oleksii, mid-build, owner-approved final
            // copy - two words, 457px on one line, 333px for "Шукають"
            // alone - the longer word is now WIDER than the old
            // single-word heading ever was). Row 1 is a flex row sharing
            // space with the filter trigger, and a flex item's default
            // `min-width: auto` floors it at its own min-content size
            // (here, the longer word, since text can only wrap at spaces
            // by default) - the exact `min-w-0` class of bug this file's
            // own mobile-toolbar comment already documents finding once
            // before. Below ~600px that floor (333px) exceeds the room
            // actually left beside the trigger, which would overflow the
            // page horizontally rather than wrap. `min-w-0` lets the flex
            // item shrink past that floor; `break-words` guarantees even
            // a single word breaks rather than visually overflowing in
            // the rare case the full available width is narrower than it
            // - together, "stays on one line from 1024px up and wraps
            // cleanly below that," verified by computed-style measurement
            // at the real breakpoints, not by eye.
            title={
              <h1 className="min-w-0 break-words font-brand-display text-[48px] leading-none text-brand-ink">
                {uk.feed.galleryTitle}
              </h1>
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
                cities={cityList}
                citySlugs={citySlugs}
                resultCount={page.totalMatching}
                shelterCount={page.totalShelters}
              />
            }
          >
            <ReplaceNav>
              <GalleryFilterDropdowns
                filters={filters}
                sort={sort}
                cities={cityList}
                citySlugs={citySlugs}
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
                  className="sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:min-h-12 focus:items-center focus:rounded-brand-field focus:bg-brand-ink focus:px-4 focus:text-[15px] focus:text-brand-on-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
                >
                  {uk.pagination.skipLink}
                </a>
              )}

              {/*
                4 columns at `desktop:`, gap 30 (the frame's own numbers) -
                below that, this PR keeps the pre-existing 1/2-column,
                16px-gap breakpoints ("below 1024px... keep the existing
                column counts and breakpoints"). No max-width on the grid
                itself: the page wrapper above already caps content at 1400.
              */}
              <ArrowKeyGrid className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-4 desktop:gap-[30px]">
                {page.items.map((item, index) => (
                  <GalleryCard
                    key={item.id}
                    card={item}
                    cityName={cityNames.get(cardCityId(item)) ?? null}
                    priority={index < PRIORITY_ROW_SIZE}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Server Component. Next.js calls this with `{ searchParams }` - a Promise, per Next 16's App Router contract. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [rawSearchParams, kabinetSignedIn] = await Promise.all([
    searchParams,
    kabinetSessionCookiePresent(),
  ]);
  return renderGallery(anonymousRouterClient(), rawSearchParams, kabinetSignedIn);
}
