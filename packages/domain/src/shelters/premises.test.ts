import { describe, expect, it } from "vitest";
import { testOnlyLocationPolicy } from "../primitives/coordinates";
import { CityIdSchema, EdrpouSchema, ShelterIdSchema } from "../primitives/ids";
import type { ShelterLegalEntity } from "./legal-entity";
import type { ExactAddress } from "./location";
import {
  exactAddressOf,
  legalEntityEditRefusalOf,
  mayUseFosterHomes,
  premisesEditRefusalOf,
  premisesOfAddress,
  premisesPublicLocationOf,
  ShelterPremisesSchema,
} from "./premises";

const CITY = CityIdSchema.parse("22222222-2222-4222-8222-222222222222");
const SHELTER = ShelterIdSchema.parse("33333333-3333-4333-8333-333333333333");
const ADDRESS: ExactAddress = {
  line1: "вул. Тестова, 1",
  line2: null,
  postalCode: null,
  cityId: CITY,
  district: { uk: "Центр", en: null },
  coordinates: { lat: 50.45, lng: 30.52 },
};
const NGO: ShelterLegalEntity = {
  kind: "registered_ngo",
  legalName: "ГО Тест",
  edrpou: EdrpouSchema.parse("12345678"),
  registeredAt: new Date("2020-01-01T00:00:00.000Z"),
};
const FOP: ShelterLegalEntity = {
  kind: "sole_proprietor",
  legalName: "ФОП Тест",
  edrpou: EdrpouSchema.parse("12345678"),
};
const INITIATIVE: ShelterLegalEntity = {
  kind: "unregistered_initiative",
  contactPersonName: "Оксана",
};
const POLICY = testOnlyLocationPolicy("test");

describe("premises", () => {
  it("reads the address of an address only, and builds premises from a stored address", () => {
    expect(exactAddressOf({ kind: "address", address: ADDRESS })).toEqual(ADDRESS);
    expect(exactAddressOf({ kind: "foster_homes" })).toBeNull();
    expect(exactAddressOf({ kind: "not_recorded" })).toBeNull();
    expect(premisesOfAddress(ADDRESS)).toEqual({ kind: "address", address: ADDRESS });
    expect(premisesOfAddress(null)).toEqual({ kind: "not_recorded" });
  });

  it("keeps no address on foster homes, even when one is sent", () => {
    const parsed = ShelterPremisesSchema.parse({ kind: "foster_homes", address: ADDRESS });
    expect(parsed).toEqual({ kind: "foster_homes" });
  });

  it("lets only an initiative use foster homes (D3)", () => {
    expect([NGO, FOP, INITIATIVE, null].map(mayUseFosterHomes)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    for (const entity of [NGO, FOP, null]) {
      expect(premisesEditRefusalOf(entity, { kind: "foster_homes" })).toBe(
        "foster_homes_need_initiative",
      );
      expect(premisesEditRefusalOf(entity, { kind: "address", address: ADDRESS })).toBeNull();
    }
    expect(premisesEditRefusalOf(INITIATIVE, { kind: "foster_homes" })).toBeNull();
  });

  it("refuses leaving the initiative form while in foster homes, until an address is added (D5)", () => {
    for (const next of [NGO, FOP]) {
      expect(legalEntityEditRefusalOf({ kind: "foster_homes" }, next)).toBe(
        "premises_needs_address",
      );
      expect(legalEntityEditRefusalOf({ kind: "address", address: ADDRESS }, next)).toBeNull();
      expect(legalEntityEditRefusalOf({ kind: "not_recorded" }, next)).toBeNull();
    }
    expect(legalEntityEditRefusalOf({ kind: "foster_homes" }, INITIATIVE)).toBeNull();
  });

  it("gives foster homes the city alone: no district, no coordinates", () => {
    expect(premisesPublicLocationOf(SHELTER, { kind: "foster_homes" }, CITY, POLICY)).toEqual({
      precision: "city",
      cityId: CITY,
      district: null,
    });
    expect(
      premisesPublicLocationOf(SHELTER, { kind: "address", address: ADDRESS }, CITY, POLICY)
        .precision,
    ).toBe("fuzzed_address");
  });
});
