import { describe, expect, it } from "vitest";
import { testOnlyLocationPolicy } from "../primitives/coordinates";
import { CityIdSchema, ShelterIdSchema } from "../primitives/ids";
import { type ExactAddress, publicLocationOf } from "./location";

const SHELTER = ShelterIdSchema.parse("11111111-1111-4111-8111-111111111111");
const CITY = CityIdSchema.parse("22222222-2222-4222-8222-222222222222");
const POLICY = testOnlyLocationPolicy("location-test-key");

const address = (coordinates: ExactAddress["coordinates"]): ExactAddress => ({
  line1: "вул. Тестова, 1",
  line2: null,
  postalCode: null,
  cityId: CITY,
  district: { uk: "Центр", en: null },
  coordinates,
});

describe("publicLocationOf", () => {
  it("fuzzes a known point", () => {
    const location = publicLocationOf(SHELTER, address({ lat: 50.45, lng: 30.52 }), POLICY);
    expect(location.precision).toBe("fuzzed_address");
  });

  it("falls back to the city alone when the address has no point, never a guessed one", () => {
    expect(publicLocationOf(SHELTER, address(null), POLICY)).toEqual({
      precision: "city",
      cityId: CITY,
      district: { uk: "Центр", en: null },
    });
  });
});
