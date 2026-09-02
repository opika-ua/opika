import type { CityId } from "@opika/domain";
import { textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { anonymousRouterClient } from "../../api/server-client";
import { AnimalCard } from "../../features/gallery/AnimalCard";
import { ArrowKeyGrid } from "../../features/gallery/ArrowKeyGrid";
import { cardCityId } from "../../features/gallery/card-text";
import { DeckEntryLink } from "../../features/gallery/DeckEntryLink";
import { FilterRail } from "../../features/gallery/FilterRail";
import { FilterSheet } from "../../features/gallery/FilterSheet";
import {
  deckEntryHref,
  parseGalleryQuery,
  type SearchParams,
} from "../../features/gallery/filter-url";
import { GalleryPagination } from "../../features/gallery/GalleryPagination";
import { railResultCount, sheetResultCount } from "../../features/gallery/gallery-copy";
import { hasPagination } from "../../features/gallery/gallery-pagination";
import { NoMatch } from "../../features/gallery/NoMatch";
import { OutOfRangeNotice } from "../../features/gallery/OutOfRangeNotice";
import { ReplaceNav } from "../../features/gallery/ReplaceNav";
import { SortControl } from "../../features/gallery/SortControl";

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
 * Split from the default export for the same reason `renderHome` is:
 * `page.test.tsx` calls this directly with a test database, `Page`'s own
 * call below still calls it with Next's real `{ searchParams }` so the
 * two call signatures never collide.
 */
export async function renderGallery(
  client: ReturnType<typeof anonymousRouterClient> = anonymousRouterClient(),
  rawSearchParams: SearchParams = {},
) {
  const { filters, sort, page: pageNumber } = parseGalleryQuery(rawSearchParams);

  const [cities, page] = await Promise.all([
    client.cities.list({}),
    client.gallery.list({ filters, sort, page: pageNumber }),
  ]);
  const cityList = cities.map((city) => ({ id: city.id, name: textIn(city.name, "uk") }));
  const cityNames = new Map<CityId, string>(cityList.map((city) => [city.id, city.name]));

  /**
   * E5, docs/design/README.md "Gallery ↔ deck" > "Entry": the deck has
   * nothing to show when the gallery itself has no matches, so the control
   * is only rendered alongside the grid, never alongside `NoMatch`. `total`
   * rides along on the URL rather than the deck re-deriving it — see
   * `deckEntryHref`'s own comment.
   */
  const deckHref = deckEntryHref(filters, page.totalMatching);

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
      <header className="min-h-14 tablet:min-h-16 desktop:min-h-17 flex items-center justify-between bg-rg-surface px-4 tablet:px-6 desktop:px-15">
        <span className="font-bold text-[19px] text-rg-ink">Opika</span>
        {/*
          docs/design/README.md "Screens" > "Gallery": the header's full row
          also has a city chip, "Мої запити · N" and a UA/EN switch — none
          of those exist yet (My reveals and i18n are separate, later
          phases), so this is the one piece E5 actually owns. `hidden
          desktop:inline-flex`: the mobile half of this same control lives
          in the row below instead — that row's own comment records why
          it's neither the mock's sticky bottom bar nor a combined
          "Фільтри · N" label, both pre-existing gaps this phase didn't
          introduce.
        */}
        {page.totalMatching > 0 && (
          <DeckEntryLink
            href={deckHref}
            testId="deck-entry-desktop"
            className="hidden desktop:inline-flex min-h-12 items-center rounded-rg-button bg-rg-fill px-4 text-[15px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
          >
            {uk.feed.enterDeck}
          </DeckEntryLink>
        )}
      </header>

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
        <div className="flex items-center justify-between gap-4 mb-4 desktop:hidden">
          <span className="text-[15px]/[22px] text-rg-ink-2">
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
                className="min-h-11 inline-flex items-center rounded-rg-button bg-rg-fill px-3.5 text-[13px] font-medium text-rg-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
              >
                {uk.feed.enterDeckShort}
              </DeckEntryLink>
            )}
            <FilterSheet
              filters={filters}
              sort={sort}
              cities={cityList}
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
                <SortControl filters={filters} sort={sort} />
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
              <NoMatch filters={filters} sort={sort} relaxations={relaxations} />
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

                <ArrowKeyGrid className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4 gap-4 desktop:gap-6 desktop:max-w-[960px] wide:max-w-[1320px]">
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
                  page={page.page}
                  totalPages={page.totalPages}
                />
              </>
            )}
          </div>
        </div>

        {/*
          e-Ukraine's CC BY 4.0 attribution requirement — the user-reachable
          credit `docs/design/README.md`'s V2 definition-of-done calls for,
          alongside the licence file at
          apps/web/src/app/fonts/e-ukraine/LICENSE.txt.
        */}
        <footer className="mt-8 flex items-center gap-4 text-[13px]/[18px] text-rg-ink-3">
          <span>{uk.footer.fontCredit}</span>
          <Link
            href="/pro"
            className="shrink-0 underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] rounded-rg-button"
          >
            {uk.footer.about}
          </Link>
        </footer>
      </div>
    </div>
  );
}

/** Server Component. Next.js calls this with `{ searchParams }` — a Promise, per Next 16's App Router contract. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return renderGallery(anonymousRouterClient(), await searchParams);
}
