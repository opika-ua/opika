import type { CityId, FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Chip } from "./FilterRail";
import { galleryHref } from "./filter-url";

interface FirstRunBandProps {
  filters: FeedFilters;
  sort: GallerySort;
  cities: ReadonlyArray<{ id: CityId; name: string }>;
}

/**
 * `docs/design/README.md:427-428`, "01 First run": "the first visit to the
 * gallery, not a separate screen: promise and city choice in a 760 centred
 * band above the grid, gone once a city is chosen. Nothing blocks
 * browsing." Rendered by `renderGallery` only when `filters.cities.kind ===
 * "any"` — the same condition the spec names ("gone once a city is
 * chosen"). No CTA button and no explicit "every city" chip: the grid is
 * already visible below, unfiltered, so picking a city here is an optional
 * real filter navigation (`galleryHref`, the same helper the rail and
 * sheet use), not a gate in front of browsing — "nothing blocks browsing"
 * taken literally.
 *
 * Previously built as a standalone `/` route (`features/home/HomeScreen.tsx`,
 * retired — see `next.config.ts`'s `/` redirect). That shipped a page
 * contradicting this exact spec: the mock-frame search that scoped it found
 * no frame for this screen (there isn't one), and concluded "no frame"
 * meant "unspecified" without reading the prose that says otherwise. See
 * `docs/standing-constraints.md`'s "When no mock exists, the prose is the
 * spec."
 */
export function FirstRunBand({ filters, sort, cities }: FirstRunBandProps) {
  if (filters.cities.kind !== "any") return null;

  return (
    <div className="max-w-[760px] mx-auto mb-8 flex flex-col gap-4">
      <p className="text-[17px]/[26px] text-rg-ink m-0">{uk.firstRun.promise}</p>
      <p className="text-[13px]/[18px] text-rg-ink-3 m-0">{uk.firstRun.disclaimer}</p>
      <div className="flex flex-wrap gap-2" data-testid="first-run-cities">
        {cities.map((city) => (
          <Chip
            key={city.id}
            active={false}
            href={galleryHref({ ...filters, cities: { kind: "oneOf", values: [city.id] } }, sort)}
          >
            {city.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
