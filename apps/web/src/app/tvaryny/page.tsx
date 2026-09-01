import type { CityId } from "@opika/domain";
import { textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import { anonymousRouterClient } from "../../api/server-client";
import { AnimalCard } from "../../features/gallery/AnimalCard";
import { ArrowKeyGrid } from "../../features/gallery/ArrowKeyGrid";
import { cardCityId } from "../../features/gallery/card-text";
import { FilterRail } from "../../features/gallery/FilterRail";
import { FilterSheet } from "../../features/gallery/FilterSheet";
import { parseGalleryQuery, type SearchParams } from "../../features/gallery/filter-url";
import { GalleryPagination } from "../../features/gallery/GalleryPagination";
import { railResultCount, sheetResultCount } from "../../features/gallery/gallery-copy";
import { hasPagination } from "../../features/gallery/gallery-pagination";
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
 * Empty/loading/error states (E4) are still deliberately absent. That
 * includes the out-of-range-page note: `gallery.list` already clamps a
 * stale `?stor=` server-side and this page already renders the clamped
 * page, but the note saying so ("Сторінки 7 більше немає") is E4's, not
 * rendered here yet.
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

  return (
    <div className="min-h-dvh bg-paper-alt">
      <header className="min-h-14 tablet:min-h-16 desktop:min-h-17 flex items-center bg-paper border-b border-line px-4 tablet:px-6 desktop:px-15">
        <span className="font-serif font-medium text-[19px] text-ink">Opika</span>
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
          <span className="font-sans text-sm text-ink-3">
            {sheetResultCount(
              page.totalMatching,
              page.totalShelters,
              filters.cities.kind !== "any",
            )}
          </span>
          <FilterSheet
            filters={filters}
            sort={sort}
            cities={cityList}
            resultCount={page.totalMatching}
            shelterCount={page.totalShelters}
          />
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
              <span className="font-sans text-sm text-ink-3">
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
            {hasPagination(page.totalPages) && (
              <a
                href="#pagination"
                data-testid="pagination-skip-link"
                className="sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-button focus:bg-leaf focus:px-4 focus:font-sans focus:text-sm focus:text-paper"
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
          </div>
        </div>
      </div>
    </div>
  );
}

/** Server Component. Next.js calls this with `{ searchParams }` — a Promise, per Next 16's App Router contract. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return renderGallery(anonymousRouterClient(), await searchParams);
}
