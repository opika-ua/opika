import type { CityId } from "@opika/domain";
import { textIn } from "@opika/domain";
import { anonymousRouterClient } from "../../api/server-client";
import { AnimalCard } from "../../features/gallery/AnimalCard";
import { cardCityId } from "../../features/gallery/card-text";
import { FilterRail } from "../../features/gallery/FilterRail";
import { FilterSheet } from "../../features/gallery/FilterSheet";
import { parseGalleryQuery, type SearchParams } from "../../features/gallery/filter-url";
import { railResultCount, sheetResultCount } from "../../features/gallery/gallery-copy";
import { SortControl } from "../../features/gallery/SortControl";

/**
 * Same reasoning as `../page.tsx`: without this, `next build` would try to
 * prerender the gallery at build time, which needs `DATABASE_URL` as a
 * build-time secret and would bake in a snapshot that goes stale the moment
 * a shelter's listing changes.
 */
export const dynamic = "force-dynamic";

/**
 * The `wide` breakpoint's column count (`globals.css`) — the largest first
 * row any layout renders, so a superset of every narrower breakpoint's own
 * first row. See `AnimalCard`'s `priority` prop doc for why this matters.
 */
const PRIORITY_ROW_SIZE = 4;

/**
 * E2's filters + sort, over E1's grid. `docs/build-plan.md`'s E2 row: "Filter
 * and sort state in the URL — shareable, back-button-correct." Pagination
 * (E3) and empty/loading/error states (E4) are still deliberately absent —
 * `page` always resolves through `parseGalleryQuery`, but nothing here
 * renders pager controls yet.
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
            {sheetResultCount(page.totalMatching, page.totalShelters)}
          </span>
          <FilterSheet
            filters={filters}
            sort={sort}
            cities={cityList}
            resultCount={page.totalMatching}
          />
        </div>

        {/* 280 (rail) + 32 (rail-grid gap) + 960/1320 (grid's own content width) = 1272/1632. */}
        <div className="desktop:flex desktop:gap-8 desktop:items-start desktop:max-w-[1272px] wide:max-w-[1632px] desktop:mx-auto">
          <FilterRail filters={filters} sort={sort} cities={cityList} />

          <div className="flex-1 min-w-0">
            <div className="hidden desktop:flex items-center justify-between mb-4">
              <span className="font-sans text-sm text-ink-3">
                {railResultCount(page.totalMatching, page.totalShelters)}
              </span>
              <SortControl filters={filters} sort={sort} />
            </div>

            <main
              data-testid="gallery-grid"
              className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4 gap-4 desktop:gap-6 desktop:max-w-[960px] wide:max-w-[1320px]"
            >
              {page.items.map((item, index) => (
                <AnimalCard
                  key={item.id}
                  card={item}
                  cityName={cityNames.get(cardCityId(item)) ?? null}
                  priority={index < PRIORITY_ROW_SIZE}
                />
              ))}
            </main>
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
