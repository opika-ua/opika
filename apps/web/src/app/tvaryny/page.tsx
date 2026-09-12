import type { CityId } from "@opika/domain";
import { textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import { permanentRedirect } from "next/navigation";
import { anonymousRouterClient } from "../../api/server-client";
import { Footer } from "../../features/chrome/Footer";
import { SiteHeader } from "../../features/chrome/SiteHeader";
import { AnimalCard } from "../../features/gallery/AnimalCard";
import { ArrowKeyGrid } from "../../features/gallery/ArrowKeyGrid";
import { cardCityId } from "../../features/gallery/card-text";
import { DeckEntryLink } from "../../features/gallery/DeckEntryLink";
import { FilterRail } from "../../features/gallery/FilterRail";
import { FilterSheet } from "../../features/gallery/FilterSheet";
import {
  deckEntryHref,
  parseGalleryQuery,
  redirectHrefForLegacyCityIds,
  type SearchParams,
} from "../../features/gallery/filter-url";
import { GalleryPagination } from "../../features/gallery/GalleryPagination";
import { railResultCount, sheetResultCount } from "../../features/gallery/gallery-copy";
import { hasPagination } from "../../features/gallery/gallery-pagination";
import { NoMatch } from "../../features/gallery/NoMatch";
import { OutOfRangeNotice } from "../../features/gallery/OutOfRangeNotice";
import { ReplaceNav } from "../../features/gallery/ReplaceNav";
import { SortControl } from "../../features/gallery/SortControl";
import { REGISTRY_HAS_NO_REAL_SHELTERS } from "../../seo-flags";

/**
 * Same reasoning as `../page.tsx`: without this, `next build` would try to
 * prerender the gallery at build time, which needs `DATABASE_URL` as a
 * build-time secret and would bake in a snapshot that goes stale the moment
 * a shelter's listing changes.
 */
export const dynamic = "force-dynamic";

/**
 * Not the `wide` breakpoint's column count (4) — that was tried first and
 * rejected on review: at a 360px phone (1 column), it means 3 of the 4
 * "priority" preloads compete with the real LCP image for bandwidth on
 * exactly the audience (Ukrainian mobile, carrier networks) this matters
 * most for, while nothing is even on screen to show for two of them. `2` is
 * the tablet breakpoint's column count — still 1 wasted preload at phone
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
 * (`error.tsx` — see its own comment for why there is one, not the
 * design's stated two), and the out-of-range-page notice, below. A
 * loading state (L1/L2) was investigated and deliberately NOT built this
 * pass — Next's route-level `loading.tsx` convention forces every
 * response through Suspense/streaming, which broke the no-JS path
 * outright (real content stayed in a hidden template a no-JS browser
 * never swaps in — caught by this repo's own no-JS harness tests, not
 * guessed at). A correct version needs a client-driven pending indicator
 * that never touches server rendering, which is real new scope, not a
 * one-file addition — see the open question this phase's PR raises.
 * `docs/design/README.md`'s own
 * "Next-page error" frame is intentionally not consumed anywhere — its
 * note there explains why.
 *
 * No `FirstRunBand` here (below the header, above the mobile summary row and
 * the rail+grid row) — `docs/design/README.md:427`'s "01 First run" band was
 * built, then removed in Phase D (O-3, `docs/observations.md`): it duplicated
 * the filter rail and the result count, and delayed the content it sat
 * above. See that section's own amendment note for what survives
 * (`uk.firstRun.promise` as `og:description` only). `/` still redirects here
 * (`next.config.ts`) rather than serving its own route — a standalone `/`
 * page was tried first and reverted for contradicting the original spec.
 *
 * **Correction, 2026-09-10 — found by Oleksii, not by any test; a first
 * draft of this correction then had its own history wrong, found by the
 * reviewer.** `uk.firstRun.promise` survives as `og:description` *when real
 * shelters exist*; the D-2 demo disclosure (`uk.demo.bannerNotice`, this
 * page's `linkPreviewDescription` while `REGISTRY_HAS_NO_REAL_SHELTERS`)
 * survives the same way — and both `description`/`og:description` render
 * only in a shared-link preview or a search snippet, never in the page a
 * visitor actually opens. **Not what `FirstRunBand` used to show**, on
 * inspection of the deleted component itself (`git show`), not assumed:
 * that band rendered `firstRun.promise` + `firstRun.disclaimer`, two
 * different sentences, and its removal (O-3, unrelated reasons — duplicated
 * the filter rail, delayed the content) is not what left `bannerNotice`
 * invisible here. `bannerNotice` was *never* rendered in this page's body,
 * at any point in this repo's history — only in metadata, always. The
 * deck (`DeckScreen.tsx`) shows "Демо" in its own header; this route, the
 * higher-traffic one, showed nothing at all. Fixed below: the same
 * already-approved `bannerNotice` sentence, rendered visibly for the first
 * time, directly under the header — not the slot `FirstRunBand` used to
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
) {
  /**
   * Cities have to be fetched before the URL can be parsed at all now — a
   * city token in `?misto=` is a slug, and resolving a slug to a `CityId`
   * needs the real city list, not just a shape check the way a raw UUID
   * did. This costs the parallel `Promise.all` with `gallery.list` this file
   * used to have (O-6/O-12, `docs/build-plan.md`'s Phase S) — a real,
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
   * E5, docs/design/README.md "Gallery ↔ deck" > "Entry": the deck has
   * nothing to show when the gallery itself has no matches, so the control
   * is only rendered alongside the grid, never alongside `NoMatch`. `total`
   * rides along on the URL rather than the deck re-deriving it — see
   * `deckEntryHref`'s own comment.
   */
  const deckHref = deckEntryHref(filters, page.totalMatching, citySlugs);

  /**
   * docs/design/README.md, "Gallery states" > "No match". Only queried when
   * there's actually nothing to show — `gallery.relaxationCounts` is its
   * own scan (`packages/contracts/src/procedures/gallery.ts`: "a single
   * scan with one COUNT(*) FILTER per constrained dimension, not a reuse of
   * the page fetch"), so a normal, matching page never pays for it.
   */
  const relaxations =
    page.totalMatching === 0
      ? (await client.gallery.relaxationCounts({ filters })).relaxations
      : [];

  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      {/*
        Phase T moved the wordmark, heights and nav into `SiteHeader` — see
        that component for what the design specifies and what was composed.
        The deck entry stays here rather than moving with them: it is the
        gallery's own control, not site-wide chrome, and `hidden
        desktop:inline-flex` keeps its mobile half in the row below (that
        row's own comment records why it's neither the mock's sticky bottom
        bar nor a combined "Фільтри · N" label — both pre-existing gaps).
      */}
      <SiteHeader wordmarkIsCurrentPage>
        {page.totalMatching > 0 && (
          <DeckEntryLink
            href={deckHref}
            testId="deck-entry-desktop"
            className="hidden desktop:inline-flex min-h-12 items-center rounded-rg-button bg-rg-fill px-4 text-[15px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {uk.feed.enterDeck}
          </DeckEntryLink>
        )}
      </SiteHeader>

      {/*
        The gallery's own visible carrier of the D-2 demo disclosure — see
        this file's top comment (2026-09-10 correction) for why the deck's
        header label alone wasn't enough and `og:description` doesn't count
        as visible. Muted, single line, no colour beyond the standard
        caption tone: a factual notice, not an alert (this app's own
        "freshness is honest and never alarming" rule, applied to the same
        idea — demo status is stated, not tinted).
      */}
      {REGISTRY_HAS_NO_REAL_SHELTERS && (
        <div className="px-4 tablet:px-6 desktop:px-15 pt-4 desktop:pt-6">
          <span data-testid="gallery-demo-banner" className="text-[13px]/[18px] text-rg-ink-3">
            {uk.demo.bannerNotice}
          </span>
        </div>
      )}

      {/*
        Padding and max-width deliberately live on different elements.
        Preflight is border-box, so a max-width and a padding on the SAME
        element share one budget — max-w-[960px] plus px-15 (60px a side)
        would leave 840px of actual content, not the design's 960. This way
        the outer div's padding sets the page-edge margin and the rail/grid
        row's own max-width is the real content width, matching how the
        design states them as two separate numbers ("page padding 40 60 56
        desktop ... content 960").
      */}
      <div className="p-4 tablet:p-6 desktop:pt-10 desktop:px-15 desktop:pb-14">
        <div
          data-testid="gallery-mobile-toolbar"
          className="flex items-center justify-between gap-4 mb-4 desktop:hidden"
        >
          {/*
            `min-w-0`, found 2026-09-12 as the real cause of a CI-only
            horizontal-overflow failure at 320px. A flex item's default
            `min-width: auto` floors it at its own min-content width — here
            the longest Ukrainian word in the count sentence, 93px. At 320
            the row has 288px of content box, the button group beside this
            span needs 193px and will not shrink, so the span was clamped at
            its 93px floor and the 15px that did not fit was pushed out of
            the container instead: the group's right edge landed at 318.59px
            against a 320px viewport. That 1.41px was font metrics, not
            layout — CI's Linux Chromium renders this sentence a couple of
            pixels wider than this machine's Windows Chromium and tipped it
            to a 322px document, which is why it failed only there.
            `min-w-0` removes the floor, so the sentence wraps to another
            line and the group sits at the container's own padding edge
            (304px) — a position set by padding rather than by text width,
            which is what makes the slack real. Measured no-op at 360 and
            390, where the span never reaches its floor.
          */}
          <span className="min-w-0 text-[15px]/[22px] text-rg-ink-2">
            {sheetResultCount(
              page.totalMatching,
              page.totalShelters,
              filters.cities.kind !== "any",
            )}
          </span>
          {/*
            docs/design/README.md's 0–599 row calls this a "sticky bottom
            bar «Фільтри · N / Гортати»" — this row is neither sticky nor
            that combined "N" label (`FilterSheet`'s own trigger predates
            E5 and reads plainly "Фільтри"). Both are pre-existing gaps
            from whichever phase built this row, not introduced here;
            adding "Гортати" beside the existing trigger is E5's actual
            scope, not a retrofit of the row's positioning.
          */}
          <div className="flex items-center gap-2">
            {page.totalMatching > 0 && (
              <DeckEntryLink
                href={deckHref}
                testId="deck-entry-mobile"
                /* 48, not 44 — README:200's minimum touch target. This one is
                   the mobile deck entry, so it is on the gallery for every
                   phone visitor; found by Phase D's sweep, not by a report. */
                className="min-h-12 inline-flex items-center rounded-rg-button bg-rg-fill px-3.5 text-[13px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
              >
                {uk.feed.enterDeckShort}
              </DeckEntryLink>
            )}
            <FilterSheet
              filters={filters}
              sort={sort}
              cities={cityList}
              citySlugs={citySlugs}
              resultCount={page.totalMatching}
              shelterCount={page.totalShelters}
            />
          </div>
        </div>

        {/*
          No max-width on this row itself — it's implicitly bounded by its
          children's own constraints (rail: fixed 280px; grid: max-width
          960/1320) regardless of viewport, so an explicit outer cap would
          only ever be redundant or, below the point every child's stated
          size actually fits (1392px/1752px after padding — see
          docs/design/README.md's note under "Breakpoints & Surfaces"),
          actively wrong: it doesn't change how much room the grid gets,
          but it looks like it should. The grid's own max-width is what
          makes 960/1320 a ceiling the fluid case below it approaches
          rather than a constant every viewport must hit exactly — E1's
          own harness assumed the latter, correctly, before the rail
          existed and there was nothing else in "content" to divide.
        */}
        <div className="desktop:flex desktop:gap-8 desktop:items-start">
          <ReplaceNav>
            <FilterRail
              filters={filters}
              sort={sort}
              cities={cityList}
              citySlugs={citySlugs}
              resultCount={page.totalMatching}
              shelterCount={page.totalShelters}
            />
          </ReplaceNav>

          <div className="flex-1 min-w-0">
            <div className="hidden desktop:flex items-center justify-between mb-4">
              <span className="text-[15px]/[22px] text-rg-ink-2">
                {railResultCount(page.totalMatching, page.totalShelters)}
              </span>
              <ReplaceNav>
                <SortControl filters={filters} sort={sort} citySlugs={citySlugs} />
              </ReplaceNav>
            </div>

            {/*
              Dropping E2.5's roving tabindex (docs/build-plan.md's E2.5 row)
              means every card is a real Tab stop — 24 of them — so this is
              the shortcut past them to "next page," not decoration. Only
              rendered when GalleryPagination itself will be, through the
              same `hasPagination` both sides read: a skip link to an id
              that isn't on the page goes nowhere.
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
                  actually resolved and served (E0's clamp). They differ
                  only when the requested page was beyond `totalPages` but
                  within `MAX_GALLERY_PAGE` — anything past that ceiling
                  fails oRPC's own input validation before this component
                  ever renders, and is caught by error.tsx instead.
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
                    className="sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:min-h-12 focus:items-center focus:rounded-rg-button focus:bg-rg-ink focus:px-4 focus:text-[15px] focus:text-rg-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
                  >
                    {uk.pagination.skipLink}
                  </a>
                )}

                <ArrowKeyGrid className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4 ultrawide:grid-cols-6 gap-4 desktop:gap-6 desktop:max-w-[960px] wide:max-w-[1320px] ultrawide:max-w-[1992px]">
                  {page.items.map((item, index) => (
                    <AnimalCard
                      key={item.id}
                      card={item}
                      cityName={cityNames.get(cardCityId(item)) ?? null}
                      priority={index < PRIORITY_ROW_SIZE}
                    />
                  ))}
                </ArrowKeyGrid>

                <GalleryPagination
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

        <Footer />
      </div>
    </div>
  );
}

/** Server Component. Next.js calls this with `{ searchParams }` — a Promise, per Next 16's App Router contract. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return renderGallery(anonymousRouterClient(), await searchParams);
}
