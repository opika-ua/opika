import { NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { activeFilterChips, activeFilterCount } from "./active-filters";
import { parseGalleryQuery } from "./filter-url";
import {
  BROVARY_LABEL,
  COUNTS,
  facetCity,
  KYIV_LABEL,
  KYIV_OBL,
  LVIV_OBL,
  PLACE_BOOK,
  REGION_LABELS,
} from "./test-places";

const counts = {
  ...COUNTS,
  cities: [facetCity(BROVARY_LABEL, 4), facetCity(KYIV_LABEL, 9)],
};

const filters = {
  ...NO_FILTERS,
  regions: { kind: "oneOf", values: [KYIV_OBL] },
  cities: { kind: "oneOf", values: [BROVARY_LABEL.id] },
  ages: { kind: "oneOf", values: ["adult", "young"] },
  species: { kind: "oneOf", values: ["dog"] },
} as const;

const chips = () =>
  activeFilterChips({
    filters,
    sort: "freshest",
    citySlugs: PLACE_BOOK.slugs,
    regionLabels: REGION_LABELS,
    selectedCities: [],
    counts,
  });

describe("active filter chips", () => {
  it("counts every chosen value except the species, which has its own switch", () => {
    expect(activeFilterCount(filters)).toBe(4);
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
  });

  it("has one chip per value, named in the nominative, with the removal in its accessible name", () => {
    expect(chips().map((chip) => [chip.name, chip.removeLabel])).toEqual([
      ["Київська", "Прибрати фільтр Київська"],
      ["Бровари", "Прибрати фільтр Бровари"],
      ["Дорослий", "Прибрати фільтр Дорослий"],
      ["Молодий", "Прибрати фільтр Молодий"],
    ]);
  });

  it("a chip's link is the same page without that one value (URL round-trip), species kept", () => {
    const age = chips().find((chip) => chip.name === "Молодий");
    const params = new URL(age?.href ?? "", "http://x").searchParams;
    expect([params.get("vyd"), params.get("obl"), params.get("misto"), params.get("vik")]).toEqual([
      "dog",
      "kyivska",
      "brovary-kyivska",
      "adult",
    ]);
    const back = parseGalleryQuery(
      Object.fromEntries(new URL(age?.href ?? "", "http://x").searchParams),
      PLACE_BOOK.placeIds,
    );
    expect(back.filters.ages).toEqual({ kind: "oneOf", values: ["adult"] });
    expect(back.filters.species).toEqual(filters.species);
  });

  it("removing an oblast also drops the cities that narrowed it", () => {
    const region = chips().find((chip) => chip.name === "Київська");
    const params = new URL(region?.href ?? "", "http://x").searchParams;
    expect(params.get("obl")).toBeNull();
    expect(params.get("misto")).toBeNull();
    expect(LVIV_OBL).toBeTruthy();
  });
});
