import { describe, expect, it } from "vitest";
import {
  type CityReferenceRow,
  type CityReferences,
  referenceFingerprint,
  referenceLines,
} from "../src/tools/city-references";

const ROWS: CityReferenceRow[] = [
  { cityId: "b", slug: "brovary", animals: 3, shelters: 1 },
  { cityId: "a", slug: "kyiv", animals: 10, shelters: 2 },
];

describe("referenceFingerprint", () => {
  it("does not depend on order or on slugs, which the import renames", () => {
    const renamed = ROWS.map((r) => ({ ...r, slug: `${r.slug}-kyivska` })).reverse();
    expect(referenceFingerprint(renamed)).toBe(referenceFingerprint(ROWS));
  });

  it("changes when one animal or shelter points somewhere else, or a city id changes", () => {
    const base = referenceFingerprint(ROWS);
    expect(
      referenceFingerprint([{ ...ROWS[0], animals: 4 }, ROWS[1]] as CityReferenceRow[]),
    ).not.toBe(base);
    expect(
      referenceFingerprint([{ ...ROWS[0], shelters: 0 }, ROWS[1]] as CityReferenceRow[]),
    ).not.toBe(base);
    expect(
      referenceFingerprint([{ ...ROWS[0], cityId: "c" }, ROWS[1]] as CityReferenceRow[]),
    ).not.toBe(base);
  });
});

describe("referenceLines", () => {
  it("prints counts, the fingerprint, and flags a reference to a city that does not exist", () => {
    const refs: CityReferences = {
      cities: 8,
      withCode: 0,
      aliases: 0,
      referenced: [...ROWS, { cityId: "z", slug: "<no such city>", animals: 1, shelters: 0 }],
    };
    const text = referenceLines(refs).join("\n");
    expect(text).toContain("Cities: 8 (0 with a code, 8 without), 0 slug aliases");
    expect(text).toContain("pointing at a city that does not exist: 1");
    expect(text).toContain("a  kyiv: 10 animals, 2 shelters");
    expect(text).toContain("Animals pointing at a city: 14; shelters: 3");
    expect(text).toContain(`Reference fingerprint: ${referenceFingerprint(refs.referenced)}`);
  });
});
