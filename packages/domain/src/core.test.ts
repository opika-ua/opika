import { describe, expect, it } from "vitest";
import { FeedFiltersSchema } from "./adopters/feed-filters";
import { AgeBucketSchema } from "./animals/age";
import { AnimalSexSchema, AnimalSpeciesSchema } from "./animals/animal";
import { SizeBucketSchema } from "./animals/size";
import {
  AGE_BUCKETS,
  ANIMAL_SEXES,
  ANIMAL_SPECIES,
  allChannels,
  FEED_FILTER_DIMENSIONS,
  type FeedFilters,
  GALLERY_SORTS,
  LOCALES,
  NO_FILTERS,
  parseCityId,
  parseEnum,
  parseFeedFilters,
  SIZE_BUCKETS,
} from "./core";
import { GallerySortSchema } from "./discovery/gallery-sort";
import { CityIdSchema } from "./primitives/ids";
import { LocaleSchema } from "./primitives/locale";

/**
 * `parseFeedFilters` replaces `FeedFiltersSchema.safeParse` on the client, where the schema would
 * pull zod into every page. These tests hold the two to the same answer; the schemas derive from
 * the tuples in `core`, so a vocabulary change reaches both, and anything else that could drift
 * (the uuid rule, the bounds, the defaults) is compared here.
 */
const CITY = "11111111-1111-4111-8111-111111111111";
const CITY_B = "22222222-2222-4222-9222-222222222222";
const REGION = "33333333-3333-4333-a333-333333333333";

const viaSchema = (raw: unknown): FeedFilters | null => {
  const result = FeedFiltersSchema.safeParse(raw);
  return result.success ? result.data : null;
};

const many = (count: number, make: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => make(index));
const uuidAt = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const cases: Record<string, unknown> = {
  "nothing selected": NO_FILTERS,
  "every dimension set": {
    regions: { kind: "oneOf", values: [REGION] },
    cities: { kind: "oneOf", values: [CITY, CITY_B] },
    species: { kind: "oneOf", values: ["dog"] },
    sizes: { kind: "oneOf", values: ["small", "large"] },
    ages: { kind: "oneOf", values: ["baby", "senior"] },
    sexes: { kind: "oneOf", values: ["female"] },
  },
  "saved before the oblast and sex dimensions (defaults)": {
    cities: { kind: "any" },
    species: { kind: "oneOf", values: ["cat"] },
    sizes: { kind: "any" },
    ages: { kind: "any" },
  },
  "unknown keys are dropped": {
    ...NO_FILTERS,
    extra: 1,
    species: { kind: "any", leftover: true },
  },
  "30 cities (the bound)": {
    ...NO_FILTERS,
    cities: { kind: "oneOf", values: many(30, uuidAt) },
  },
  "31 cities": { ...NO_FILTERS, cities: { kind: "oneOf", values: many(31, uuidAt) } },
  "27 regions (the bound)": {
    ...NO_FILTERS,
    regions: { kind: "oneOf", values: many(27, uuidAt) },
  },
  "28 regions": { ...NO_FILTERS, regions: { kind: "oneOf", values: many(28, uuidAt) } },
  "nil and max uuids": {
    ...NO_FILTERS,
    cities: {
      kind: "oneOf",
      values: ["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff"],
    },
  },
  "a city id that is not a uuid": {
    ...NO_FILTERS,
    cities: { kind: "oneOf", values: ["brovary"] },
  },
  "a uuid with a bad version nibble": {
    ...NO_FILTERS,
    cities: { kind: "oneOf", values: ["11111111-1111-0111-8111-111111111111"] },
  },
  "an empty oneOf": { ...NO_FILTERS, species: { kind: "oneOf", values: [] } },
  "values that are not an array": { ...NO_FILTERS, species: { kind: "oneOf", values: "dog" } },
  "an unknown species": { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog", "horse"] } },
  "an unknown size": { ...NO_FILTERS, sizes: { kind: "oneOf", values: ["huge"] } },
  "an unknown sex": { ...NO_FILTERS, sexes: { kind: "oneOf", values: ["other"] } },
  "an unknown kind": { ...NO_FILTERS, ages: { kind: "all" } },
  "a missing kind": { ...NO_FILTERS, ages: {} },
  "a required dimension missing": {
    regions: NO_FILTERS.regions,
    cities: NO_FILTERS.cities,
    species: NO_FILTERS.species,
    sizes: NO_FILTERS.sizes,
  },
  "a defaulted dimension that is null (the default is for undefined only)": {
    ...NO_FILTERS,
    regions: null,
  },
  "a selection that is an array": { ...NO_FILTERS, ages: [] },
  "a selection that is a string": { ...NO_FILTERS, sizes: "any" },
  null: null,
  "an array": [],
  "a string": "{}",
  "a number": 7,
  undefined: undefined,
  "an empty object": {},
};

describe("parseFeedFilters", () => {
  it.each(Object.entries(cases))("gives the schema's answer for %s", (_name, raw) => {
    expect(parseFeedFilters(raw)).toEqual(viaSchema(raw));
  });

  it("defaults the oblast and sex dimensions to any when they are missing", () => {
    const parsed = parseFeedFilters({
      cities: { kind: "any" },
      species: { kind: "any" },
      sizes: { kind: "any" },
      ages: { kind: "any" },
    });
    expect(parsed).toEqual(NO_FILTERS);
  });

  it("rejects junk without throwing", () => {
    for (const raw of [
      null,
      undefined,
      1,
      "x",
      [],
      { cities: 3 },
      { species: { kind: "oneOf" } },
    ]) {
      expect(parseFeedFilters(raw)).toBeNull();
    }
  });
});

describe("the tuples the schemas derive from", () => {
  it("are what the schemas accept, value for value", () => {
    expect(AnimalSpeciesSchema.options).toEqual([...ANIMAL_SPECIES]);
    expect(AnimalSexSchema.options).toEqual([...ANIMAL_SEXES]);
    expect(AgeBucketSchema.options).toEqual([...AGE_BUCKETS]);
    expect(SizeBucketSchema.options).toEqual([...SIZE_BUCKETS]);
    expect(GallerySortSchema.options).toEqual([...GALLERY_SORTS]);
    expect(LocaleSchema.options).toEqual([...LOCALES]);
  });

  it("list the filter dimensions in the schema's own key order", () => {
    expect([...FEED_FILTER_DIMENSIONS]).toEqual(FeedFiltersSchema.keyof().options);
  });
});

describe("parseEnum and parseCityId", () => {
  const values: unknown[] = ["dog", "cat", "Dog", " dog", "", null, undefined, 1, {}, ["dog"]];

  it("accept exactly what the enum schema accepts", () => {
    for (const value of values) {
      const expected = AnimalSpeciesSchema.safeParse(value);
      expect(parseEnum(ANIMAL_SPECIES, value)).toBe(expected.success ? expected.data : null);
    }
  });

  it("accept exactly the ids the id schema accepts", () => {
    const ids: unknown[] = [
      CITY,
      CITY.toUpperCase(),
      "00000000-0000-0000-0000-000000000000",
      "11111111-1111-0111-8111-111111111111",
      "not-a-uuid",
      "",
      null,
      42,
    ];
    for (const id of ids) {
      const expected = CityIdSchema.safeParse(id);
      expect(parseCityId(id)).toBe(expected.success ? expected.data : null);
    }
  });
});

describe("allChannels", () => {
  it("lists the primary first, then the additional channels", () => {
    expect(allChannels({ primary: "a", additional: ["b", "c"] })).toEqual(["a", "b", "c"]);
  });
});
