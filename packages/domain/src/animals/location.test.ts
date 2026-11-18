import { describe, expect, it } from "vitest";
import { CityIdSchema } from "../primitives/ids";
import { cityPublicLocationOf } from "../shelters/location";
import { type AnimalLocation, animalLocationOf, effectiveCityId } from "./location";

const SHELTER_CITY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const FOSTER_CITY = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

describe("effectiveCityId", () => {
  const cases: ReadonlyArray<[AnimalLocation, string]> = [
    [{ kind: "shelter_city" }, SHELTER_CITY],
    [{ kind: "own_city", cityId: FOSTER_CITY }, FOSTER_CITY],
    // Chosen explicitly: it stays put if the shelter later moves.
    [{ kind: "own_city", cityId: SHELTER_CITY }, SHELTER_CITY],
  ];
  for (const [location, expected] of cases) {
    it(`${JSON.stringify(location)} is in ${expected}`, () => {
      expect(effectiveCityId(location, SHELTER_CITY)).toBe(expected);
    });
  }
});

describe("animalLocationOf (the row mapping)", () => {
  it("reads a null public location as the shelter's city", () => {
    expect(animalLocationOf(null)).toEqual({ kind: "shelter_city" });
  });

  it("reads a set public location as the animal's own city", () => {
    expect(animalLocationOf(cityPublicLocationOf(FOSTER_CITY, null))).toEqual({
      kind: "own_city",
      cityId: FOSTER_CITY,
    });
  });
});
