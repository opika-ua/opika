"use client";

import type { CityView } from "@opika/contracts";
import { type CityId, DEFAULT_GALLERY_SORT, textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { useFeedFilters } from "../filters/use-feed-filters";
import { galleryHref } from "../gallery/filter-url";

interface HomeScreenProps {
  cities: readonly CityView[];
}

const CHIP_BASE =
  "min-h-12 inline-flex items-center rounded-rg-chip px-5 font-rg text-[15px] leading-none cursor-pointer transition-colors duration-[120ms] ease-rg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";
const CHIP_ACTIVE = "bg-rg-ink text-rg-surface font-medium";
const CHIP_INACTIVE = "bg-rg-fill text-rg-ink";

/**
 * The home page — no mock frame anywhere in either «Реєстр» handoff file
 * (`Opika Registry System.dc.html`, `Opika Registry Frames.dc.html`):
 * checked every `data-screen-label` in both, not assumed from the README.
 * V2's own scope was every *existing* built surface re-skinned; the home
 * page was never one of them, and nobody flagged the gap until it was the
 * first thing a shelter would actually see. Composed from primitives V2
 * already specified elsewhere, not invented: the chip styling is
 * `FilterRail.tsx`'s own `CHIP_BASE`/`CHIP_ACTIVE`/`CHIP_INACTIVE` verbatim
 * (docs/design/README.md, "Rail...": "Chips: 48 min-height, padding 0 20,
 * radius 999..."), the header/button classes match the gallery page's own
 * (`app/tvaryny/page.tsx`).
 *
 * Two real, load-bearing changes beyond the re-skin:
 * 1. Copy direction — the previous "Гортайте, щоб подивитися" (swipe to
 *    see) named the deck as the way to look at animals, which stopped
 *    being true the moment the gallery became the primary surface
 *    (`docs/course-correction.md`). `uk.firstRun.promise` now says
 *    "Перегляньте список" (browse the list) instead.
 * 2. The CTA now actually points at the selected city — `galleryHref`,
 *    the same helper the gallery's own filter rail uses — instead of a
 *    bare `/discovery` that ignored the city picker entirely and (via
 *    E5's permanent redirect) always landed on the deck regardless of
 *    what was selected. That was a real, silent bug this re-skin also
 *    closes, not a second unrelated change: the CTA link is the one
 *    element this whole rebuild touches for routing reasons anyway.
 *
 * Deliberately still not built: a desktop-specific treatment. Desktop's
 * first-visit state folds into the gallery itself (an unfiltered
 * `/tvaryny` already reads fine cold) — this screen is reachable at any
 * width but is really phone-shaped content, same as before this rebuild.
 * The «Українська» language toggle is removed entirely, not re-skinned —
 * deferred until H3 wires real English, same reasoning E5 gave for
 * deferring the gallery/deck mode switch until the deck had a real
 * destination: a control whose only option does nothing is a promise, not
 * a control.
 */
export function HomeScreen({ cities }: HomeScreenProps) {
  const [filters, setFilters] = useFeedFilters();
  const isAllRegion = filters.cities.kind === "any";

  function selectCity(id: CityId) {
    setFilters({ ...filters, cities: { kind: "oneOf", values: [id] } });
  }

  function selectAllRegion() {
    setFilters({ ...filters, cities: { kind: "any" } });
  }

  return (
    <div className="font-rg max-w-97.5 mx-auto min-h-dvh bg-rg-page flex flex-col justify-between p-6 box-border">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <span className="font-bold text-[26px] tracking-[-0.03em] text-rg-ink">Opika</span>
          <p className="text-[17px]/[26px] text-rg-ink m-0">{uk.firstRun.promise}</p>
          <p className="text-[13px]/[18px] text-rg-ink-3 m-0">{uk.firstRun.disclaimer}</p>
        </div>

        <fieldset className="flex flex-col border-none p-0 m-0">
          <legend className="text-[15px] font-medium text-rg-ink p-0 mb-3">
            {uk.firstRun.cityHeading}
          </legend>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => {
              const selected =
                filters.cities.kind === "oneOf" && filters.cities.values.includes(city.id);
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => selectCity(city.id)}
                  aria-pressed={selected}
                  className={`${CHIP_BASE} ${selected ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {textIn(city.name, "uk")}
                </button>
              );
            })}
            <button
              type="button"
              onClick={selectAllRegion}
              aria-pressed={isAllRegion}
              className={`${CHIP_BASE} ${isAllRegion ? CHIP_ACTIVE : CHIP_INACTIVE}`}
            >
              {uk.firstRun.allRegion}
            </button>
          </div>
        </fieldset>
      </div>

      <Link
        href={galleryHref(filters, DEFAULT_GALLERY_SORT)}
        className="w-full min-h-14 rounded-rg-button bg-rg-ink text-rg-surface text-[15px] font-medium flex items-center justify-center focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
      >
        {uk.firstRun.viewAnimals}
      </Link>
    </div>
  );
}
