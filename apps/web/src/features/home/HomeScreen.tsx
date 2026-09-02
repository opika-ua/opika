"use client";

import type { CityView } from "@opika/contracts";
import { type CityId, textIn } from "@opika/domain";
import { uk } from "@opika/i18n";
import Link from "next/link";
import { useFeedFilters } from "../filters/use-feed-filters";

interface HomeScreenProps {
  cities: readonly CityView[];
}

/**
 * Screen 01 · Перший запуск (docs/design/README.md).
 *
 * On desktop this screen doesn't exist as its own page — the promise and
 * city choice fold into the gallery's first-visit state ("Desktop
 * Breakpoints for the Eight Screens", "01 First run"). Phase E's gallery
 * (`/tvaryny`) is built now; this phone-frame screen hasn't been retired or
 * reconciled with it yet — that's a real open question (does this screen
 * still have a job once `/tvaryny` handles first-visit on desktop?), not
 * decided here.
 *
 * The CTA still routes to `/discovery`, which E5 turned into a permanent
 * redirect to `/tvaryny/gortaty` (`next.config.ts`) rather than a page — it
 * still works, transparently, but this screen's own routing hasn't been
 * updated to point at the real gallery/deck URLs directly.
 *
 * Three deliberate deviations from the design canvas
 * ("Opika - Keeper's Voice.dc.html", data-screen-label="01 First run"):
 *
 * 1. The canvas shows "Бровари" pre-selected. That is an illustrative mock state,
 *    not a default: a first-time visitor has told us nothing, and pre-picking
 *    a city for them would be the app asserting a fact it doesn't have — the
 *    same honesty rule that makes an unknown field read «Не записано» rather
 *    than "ні". "Уся Київщина" (NO_FILTERS) is the honest opening state and
 *    is also what the deck would show anyway.
 * 2. The language toggle renders "Українська" only, not "Українська \
 *    English": next-intl isn't wired until H3, and a control whose second
 *    option does nothing is a promise, not a control.
 * 3. No desktop treatment, per the note above.
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

  // Canvas: `min-height: 44; padding: 0 16; border-radius: 999`, selected
  // `font: 500 14px/1` on leaf with paper text, unselected `font: 400 14px/1`
  // with a 1px line-strong border and ink-2 text.
  const chipClass = (selected: boolean) =>
    selected
      ? "min-h-11 px-4 rounded-chip font-sans text-[14px] leading-none font-medium bg-leaf text-paper cursor-pointer"
      : "min-h-11 px-4 rounded-chip font-sans text-[14px] leading-none font-normal border border-line-strong text-ink-2 bg-paper cursor-pointer";

  return (
    <div className="max-w-97.5 mx-auto min-h-dvh bg-paper flex flex-col justify-between pt-screen px-section pb-section box-border font-sans">
      {/*
        `gap-screen` (40) is the canvas's own distance between the intro block
        and the city block, and a gap rather than a margin because
        docs/design/README.md's spacing rule is that every vertical distance
        in this design is a flex-column gap. A gap plus a margin would add,
        not override.
      */}
      <div className="flex flex-col gap-screen">
        <div className="flex flex-col gap-group">
          <span className="font-serif font-medium text-[30px]/[34.5px] tracking-[-0.01em] text-ink">
            Opika
          </span>
          <p className="font-serif font-normal text-[19px]/[28px] text-ink-2 m-0">
            {uk.firstRun.promise}
          </p>
          <p className="font-sans font-normal text-[14px]/[21.7px] text-ink-3 m-0">
            {uk.firstRun.disclaimer}
          </p>
        </div>

        <fieldset className="flex flex-col border-none p-0 m-0">
          {/*
            `mb-group` on the legend, not `gap-group` on the fieldset — the one
            place in this file that uses a margin for a vertical distance, and
            the reason is structural rather than stylistic. A rendered
            `<legend>` is lifted out of its fieldset's anonymous content box,
            so it is not a flex item and the container's `gap` never reaches
            it: measured in Chromium, `gap-row` here rendered 0px between the
            heading and the chips where the canvas asks for 16. `<fieldset>`
            stays rather than a `role="group"` div because it is the correct
            grouping element for a set of related controls, and it is what
            Biome's `useSemanticElements` requires.
          */}
          <legend className="font-sans font-medium text-[16px]/[22px] text-ink p-0 mb-group">
            {uk.firstRun.cityHeading}
          </legend>
          <div className="flex flex-wrap gap-row">
            {cities.map((city) => {
              const selected =
                filters.cities.kind === "oneOf" && filters.cities.values.includes(city.id);
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => selectCity(city.id)}
                  aria-pressed={selected}
                  className={chipClass(selected)}
                >
                  {textIn(city.name, "uk")}
                </button>
              );
            })}
            <button
              type="button"
              onClick={selectAllRegion}
              aria-pressed={isAllRegion}
              className={chipClass(isAllRegion)}
            >
              {uk.firstRun.allRegion}
            </button>
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col items-center gap-group">
        <Link
          href="/discovery"
          className="w-full min-h-13 rounded-button bg-leaf text-paper font-sans text-[16px] leading-none font-medium flex items-center justify-center"
        >
          {uk.firstRun.viewAnimals}
        </Link>
        <span className="font-sans font-normal text-[12px]/[16.8px] text-ink-3">
          {uk.locale.uk}
        </span>
      </div>
    </div>
  );
}
