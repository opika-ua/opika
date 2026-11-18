import type { CityId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { locationNeedsCity, locationPatchOf, locationValueOf } from "./location-values";

const BROVARY = "c0000000-0000-4000-8000-000000000002" as CityId;
const IRPIN = "c0000000-0000-4000-8000-000000000003" as CityId;
const brovary = { value: BROVARY, label: "м. Бровари" };

describe("«Де зараз тварина» in the form", () => {
  it("starts from the stored location", () => {
    expect(locationValueOf({ kind: "shelter_city" }, null)).toEqual({ kind: "shelter_city" });
    expect(locationValueOf({ kind: "own_city", cityId: BROVARY }, brovary)).toEqual({
      kind: "own_city",
      city: brovary,
    });
  });

  it("sends a location only when it changed and names a city", () => {
    const atShelter = { kind: "shelter_city" } as const;
    const inBrovary = { kind: "own_city", cityId: BROVARY } as const;
    expect(locationPatchOf(atShelter, { kind: "shelter_city" })).toBeNull();
    expect(locationPatchOf(atShelter, { kind: "own_city", city: null })).toBeNull();
    expect(locationPatchOf(atShelter, { kind: "own_city", city: brovary })).toEqual(inBrovary);
    expect(locationPatchOf(inBrovary, { kind: "own_city", city: brovary })).toBeNull();
    expect(
      locationPatchOf(inBrovary, { kind: "own_city", city: { value: IRPIN, label: "м. Ірпінь" } }),
    ).toEqual({ kind: "own_city", cityId: IRPIN });
    expect(locationPatchOf(inBrovary, { kind: "shelter_city" })).toEqual(atShelter);
  });

  it("«В іншому місті» without a city needs one", () => {
    expect(locationNeedsCity({ kind: "own_city", city: null })).toBe(true);
    expect(locationNeedsCity({ kind: "own_city", city: brovary })).toBe(false);
    expect(locationNeedsCity({ kind: "shelter_city" })).toBe(false);
  });
});
