import type { CityId } from "@opika/domain";
import { NO_FILTERS, textIn } from "@opika/domain";
import { anonymousRouterClient } from "../../api/server-client";
import { AnimalCard } from "../../features/gallery/AnimalCard";
import { cardCityId } from "../../features/gallery/card-text";

/**
 * Same reasoning as `../page.tsx`: without this, `next build` would try to
 * prerender the gallery at build time, which needs `DATABASE_URL` as a
 * build-time secret and would bake in a snapshot that goes stale the moment
 * a shelter's listing changes.
 */
export const dynamic = "force-dynamic";

/**
 * E1's grid over `gallery.list` — docs/build-plan.md. Deliberately narrow:
 * no rail, no sort control, no result count, no pagination links, no
 * loading/error/no-match states. Those belong to E2 (filters + sort), E3
 * (pagination) and E4 (states) respectively; building them here would be
 * exactly the ahead-of-phase scaffolding `CLAUDE.md`'s "Phase scope
 * discipline" section rules out. What's here is page 1, unfiltered, default
 * sort — a real page, just not yet the finished one.
 *
 * Split from the default export for the same reason `renderHome` is:
 * `page.test.tsx` calls this directly with a test database, `Home`'s
 * counterpart here (`Page`, below) still calls it with zero arguments so
 * Next's own `{ params, searchParams }` call signature never collides with
 * the test-only client parameter.
 */
export async function renderGallery(
  client: ReturnType<typeof anonymousRouterClient> = anonymousRouterClient(),
) {
  const [cities, page] = await Promise.all([
    client.cities.list({}),
    client.gallery.list({ filters: NO_FILTERS }),
  ]);
  const cityNames = new Map<CityId, string>(
    cities.map((city) => [city.id, textIn(city.name, "uk")]),
  );

  return (
    <div className="min-h-dvh bg-paper-alt">
      <header className="min-h-14 tablet:min-h-16 desktop:min-h-17 flex items-center bg-paper border-b border-line px-4 tablet:px-6 desktop:px-15">
        <span className="font-serif font-medium text-[19px] text-ink">Opika</span>
      </header>

      <main
        data-testid="gallery-grid"
        className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4 gap-4 desktop:gap-6 p-4 tablet:p-6 desktop:pt-10 desktop:px-15 desktop:pb-14 desktop:max-w-[960px] wide:max-w-[1320px]"
      >
        {page.items.map((item) => (
          <AnimalCard
            key={item.id}
            card={item}
            cityName={cityNames.get(cardCityId(item)) ?? null}
          />
        ))}
      </main>
    </div>
  );
}

/** Server Component. Next.js calls this with no usable arguments. */
export default async function Page() {
  return renderGallery();
}
