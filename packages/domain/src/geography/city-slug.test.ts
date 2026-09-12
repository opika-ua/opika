import { describe, expect, it } from "vitest";
import { CitySlugSchema, citySlugOf } from "./city-slug";

describe("citySlugOf", () => {
  /**
   * The corpus this repo actually seeds (`packages/db/src/seed.ts`'s
   * `CITY_DATA`), fed its own `name.en.text` — the field the migration's
   * backfill assumes, and the same field the app already displays in
   * English locale. Pinned by name because these are exactly the slugs that
   * ship in real URLs, not arbitrary examples.
   */
  it.each([
    ["Kyiv", "kyiv"],
    ["Brovary", "brovary"],
    ["Irpin", "irpin"],
    ["Bucha", "bucha"],
    ["Vyshhorod", "vyshhorod"],
    ["Boryspil", "boryspil"],
    ["Fastiv", "fastiv"],
    ["Bila Tserkva", "bila-tserkva"],
  ])("%s -> %s", (nameEn, expected) => {
    expect(citySlugOf(nameEn)).toBe(expected);
  });

  it("lowercases", () => {
    expect(citySlugOf("KYIV")).toBe("kyiv");
    expect(citySlugOf("Bila Tserkva")).toBe("bila-tserkva");
  });

  it("hyphenates multi-word names on spaces", () => {
    expect(citySlugOf("Bila Tserkva")).toBe("bila-tserkva");
  });

  it("collapses repeated separators rather than emitting an empty segment", () => {
    expect(citySlugOf("Bila  Tserkva")).toBe("bila-tserkva");
    expect(citySlugOf(" Bila Tserkva ")).toBe("bila-tserkva");
  });

  it("an existing hyphen already reads as one — spaces are the only thing rewritten", () => {
    expect(citySlugOf("Kamianets-Podilskyi")).toBe("kamianets-podilskyi");
  });

  it("produces a value CitySlugSchema itself accepts", () => {
    const slug = citySlugOf("Bila Tserkva");
    expect(CitySlugSchema.safeParse(slug).success).toBe(true);
  });

  /**
   * Deliberately not total, and deliberately not forgiving — "lowercase,
   * spaces to hyphens" is the whole rule (Oleksii's own instruction). A name
   * with an apostrophe, a period, or any other character `CitySlugSchema`
   * doesn't accept fails loudly here rather than being silently cleaned up
   * into a slug that merely looks plausible; that cleanup was the old
   * transliteration-era behaviour, not something this function does going
   * forward. None of the 8 real seeded cities' English names hit this today.
   */
  it("throws rather than silently stripping a character outside a-z0-9 and space", () => {
    expect(() => citySlugOf("O'Brien")).toThrow();
    expect(() => citySlugOf("Kyiv.")).toThrow();
    expect(() => citySlugOf("Kyiv (center)")).toThrow();
  });

  it("is not total — a name with nothing left to slug throws", () => {
    expect(() => citySlugOf("")).toThrow();
    expect(() => citySlugOf("...")).toThrow();
    expect(() => citySlugOf("   ")).toThrow();
  });
});

describe("CitySlugSchema", () => {
  it("rejects uppercase, spaces and underscores", () => {
    expect(CitySlugSchema.safeParse("Brovary").success).toBe(false);
    expect(CitySlugSchema.safeParse("bila tserkva").success).toBe(false);
    expect(CitySlugSchema.safeParse("bila_tserkva").success).toBe(false);
  });

  it("rejects a leading, trailing or doubled hyphen", () => {
    expect(CitySlugSchema.safeParse("-brovary").success).toBe(false);
    expect(CitySlugSchema.safeParse("brovary-").success).toBe(false);
    expect(CitySlugSchema.safeParse("bila--tserkva").success).toBe(false);
  });

  it("accepts a real multi-word slug", () => {
    expect(CitySlugSchema.safeParse("bila-tserkva").success).toBe(true);
  });
});
