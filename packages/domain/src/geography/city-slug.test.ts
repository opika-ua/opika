import { describe, expect, it } from "vitest";
import { CitySlugSchema, citySlugOf } from "./city-slug";

describe("citySlugOf", () => {
  /**
   * The corpus this repo actually seeds (`packages/db/src/seed.ts`'s
   * `CITY_DATA`) — pinned by name because these are exactly the slugs that
   * ship in real URLs, not arbitrary transliteration examples. Every one of
   * these is also the real, already-familiar Latin spelling (airport codes,
   * road signs) — evidence the table is implemented correctly, not just
   * internally consistent.
   */
  it.each([
    ["Київ", "kyiv"],
    ["Бровари", "brovary"],
    ["Ірпінь", "irpin"],
    ["Буча", "bucha"],
    ["Вишгород", "vyshhorod"],
    ["Бориспіль", "boryspil"],
    ["Фастів", "fastiv"],
    ["Біла Церква", "bila-tserkva"],
  ])("%s -> %s", (nameUk, expected) => {
    expect(citySlugOf(nameUk)).toBe(expected);
  });

  it("drops the soft sign entirely, not as a hyphen or letter", () => {
    expect(citySlugOf("Ольгинка")).toBe("olhynka");
  });

  it("drops an apostrophe without splitting the word", () => {
    // кам'янець: the я after a dropped apostrophe is still mid-word, "ia" —
    // not word-initial "ya", because the apostrophe is a spelling mark, not
    // a word boundary.
    expect(citySlugOf("Кам'янець")).toBe("kamianets");
    expect(citySlugOf("Кам’янець")).toBe("kamianets"); // U+2019 variant
  });

  it("uses the word-initial forms only at the start of each word", () => {
    // є/ї/й/ю/я all differ word-initial vs mid-word; none of the seeded
    // cities exercise the word-initial branch, so it needs its own case.
    expect(citySlugOf("Яготин")).toBe("yahotyn");
    expect(citySlugOf("Ужгород")).not.toContain("y"); // sanity: no й/я here
    expect(citySlugOf("Южне")).toBe("yuzhne");
    expect(citySlugOf("Ямпіль")).toBe("yampil");
  });

  it("hyphenates multi-word names on both spaces and existing hyphens", () => {
    expect(citySlugOf("Кам'янець-Подільський")).toBe("kamianets-podilskyi");
  });

  it("collapses repeated separators rather than emitting an empty segment", () => {
    expect(citySlugOf("Біла  Церква")).toBe("bila-tserkva");
  });

  it("produces a value CitySlugSchema itself accepts", () => {
    const slug = citySlugOf("Біла Церква");
    expect(CitySlugSchema.safeParse(slug).success).toBe(true);
  });

  it("renders the зг digraph as zgh, distinct from ж's plain zh", () => {
    // Real Ukrainian place/word names, not synthetic examples. Without the
    // digraph rule each of these collapses з+г into "zh", indistinguishable
    // from a name that actually contained ж — "Розгон" would read "rozhon"
    // and "Згорани" would read "zhorany".
    expect(citySlugOf("Згурівка")).toBe("zghurivka");
    expect(citySlugOf("Розгон")).toBe("rozghon");
    expect(citySlugOf("Згорани")).toBe("zghorany");
  });

  it("drops punctuation and marks rather than passing them through into an invalid slug", () => {
    expect(citySlugOf("Київ.")).toBe("kyiv");
    expect(citySlugOf("Київ (центр)")).toBe("kyiv-tsentr");
  });

  it("is not total — a name with nothing this table can romanize throws", () => {
    expect(() => citySlugOf("")).toThrow();
    expect(() => citySlugOf("...")).toThrow();
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
