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
 * Breakpoints for the Eight Screens", "01 First run"). That's Phase E's
 * gallery, not built yet, so this stays the phone-frame shape the design
 * actually specifies today rather than guessing at a desktop treatment
 * nothing describes.
 *
 * The CTA routes to /discovery — the only real destination that exists.
 * The gallery/deck view-mode switch belongs to Phase E, once there are two.
 *
 * The language toggle renders "Українська" only, not "Українська \
 * English": next-intl isn't wired until H3, and a control whose second
 * option does nothing is a promise, not a control.
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

  const chipClass = (selected: boolean) =>
    selected
      ? "min-h-11 px-4 rounded-chip font-sans text-[13px] leading-[normal] font-medium bg-leaf text-paper cursor-pointer"
      : "min-h-11 px-4 rounded-chip font-sans text-[13px] leading-[normal] font-normal border border-line-strong text-ink-2 bg-paper cursor-pointer";

  return (
    <div className="max-w-97.5 mx-auto min-h-dvh bg-paper flex flex-col justify-between pt-screen px-section pb-section box-border font-sans">
      <div className="flex flex-col gap-section">
        <div className="flex flex-col gap-group">
          <span className="font-serif font-medium text-[30px]/[34.5px] tracking-[-0.01em] text-ink">
            Opika
          </span>
          <p className="font-serif font-normal text-[19px]/[28px] text-ink m-0">
            {uk.firstRun.promise}
          </p>
          <p className="font-sans font-normal text-[14px]/[21.7px] text-ink-3 m-0">
            {uk.firstRun.disclaimer}
          </p>
        </div>

        <fieldset className="flex flex-col gap-row mt-screen border-none p-0 m-0">
          <legend className="font-sans font-medium text-[16px]/[22px] text-ink p-0">
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
          className="w-full min-h-13 rounded-button bg-leaf text-paper font-sans text-sm leading-none font-normal flex items-center justify-center"
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
