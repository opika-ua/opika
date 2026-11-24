import { describe, expect, it } from "vitest";
import { writeFailureOf } from "../shared/write-result";
import { cityLockedMessage } from "./city-locked";

const ADDRESS = {
  kind: "address",
  address: {
    line1: "вул. Київська, 300",
    line2: null,
    postalCode: null,
    cityId: "c1000000-0000-4000-8000-000000000001" as never,
    district: null,
    coordinates: null,
  },
} as const;

describe("a city locked by recorded premises (owner, 2026-11-18; D4, 2026-11-24)", () => {
  it("at an address: reads the owner's address sentence with the operator's address", () => {
    expect(cityLockedMessage(ADDRESS)).toBe(
      "Ваша адреса вже перевірена, тому місто змінюю я. Напишіть мені на hello@opika.org.ua.",
    );
  });

  it("in foster homes: reads the city sentence, never the address one", () => {
    expect(cityLockedMessage({ kind: "foster_homes" })).toBe(
      "Місто вже перевірене, тому змінюю його я. Напишіть мені на hello@opika.org.ua.",
    );
  });

  it("CITY_LOCKED maps to its own failure, not a generic one", () => {
    expect(writeFailureOf(Object.assign(new Error("x"), { code: "CITY_LOCKED" }))).toEqual({
      kind: "city_locked",
    });
  });
});
