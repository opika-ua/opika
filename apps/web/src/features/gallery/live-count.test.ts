import { NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { liveResultCount } from "./live-count";
import {
  BROVARY_LABEL,
  COUNTS,
  facetCity,
  KYIV_LABEL,
  KYIV_OBL,
  LVIV_LABEL,
  LVIV_OBL,
} from "./test-places";

const counts = {
  ...COUNTS,
  cities: [facetCity(BROVARY_LABEL, 4), facetCity(KYIV_LABEL, 9), facetCity(LVIV_LABEL, 3)],
  regions: [
    { regionId: KYIV_OBL, count: 13 },
    { regionId: LVIV_OBL, count: 3 },
  ],
  ages: { baby: 2, young: 3, adult: 5, senior: 1 },
};

describe("liveResultCount", () => {
  it("is the applied count while nothing has changed", () => {
    expect(liveResultCount(NO_FILTERS, NO_FILTERS, counts, 16)).toBe(16);
  });

  it("sums the chosen options when exactly one dimension changed", () => {
    const live = { ...NO_FILTERS, ages: { kind: "oneOf", values: ["young", "adult"] } } as const;
    expect(liveResultCount(NO_FILTERS, live, counts, 16)).toBe(8);
  });

  it("counts every option of the dimension when its choice is cleared", () => {
    const applied = { ...NO_FILTERS, ages: { kind: "oneOf", values: ["young"] } } as const;
    expect(liveResultCount(applied, NO_FILTERS, counts, 3)).toBe(11);
  });

  it("works for oblasts and cities", () => {
    const regions = { ...NO_FILTERS, regions: { kind: "oneOf", values: [LVIV_OBL] } } as const;
    expect(liveResultCount(NO_FILTERS, regions, counts, 16)).toBe(3);
    const cities = {
      ...NO_FILTERS,
      cities: { kind: "oneOf", values: [BROVARY_LABEL.id] },
    } as const;
    expect(liveResultCount(NO_FILTERS, cities, counts, 16)).toBe(4);
  });

  it("refuses to answer when two dimensions changed, rather than show a number it cannot stand behind", () => {
    const live = {
      ...NO_FILTERS,
      ages: { kind: "oneOf", values: ["young"] },
      regions: { kind: "oneOf", values: [LVIV_OBL] },
    } as const;
    expect(liveResultCount(NO_FILTERS, live, counts, 16)).toBeNull();
  });
});
