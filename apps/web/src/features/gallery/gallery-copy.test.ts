import { describe, expect, it } from "vitest";
import { railResultCount, sheetResultCount, showCountLabel } from "./gallery-copy";

describe("sheetResultCount", () => {
  describe("a city is selected — design's own screen 03 copy", () => {
    it.each([
      [1, 1, "Підходить 1 тварина. Притулків у цьому місті — 1."],
      [2, 3, "Підходить 2 тварини. Притулків у цьому місті — 3."],
      [12, 3, "Підходить 12 тварин. Притулків у цьому місті — 3."],
    ])("count=%i shelters=%i -> %s", (count, shelters, expected) => {
      expect(sheetResultCount(count, shelters, true)).toBe(expected);
    });
  });

  describe("no city selected — 'у цьому місті' would name a city that isn't chosen", () => {
    it.each([
      [1, 1, "Підходить 1 тварина у 1 притулку."],
      [220, 6, "Підходить 220 тварин у 6 притулках."],
    ])("count=%i shelters=%i -> %s", (count, shelters, expected) => {
      expect(sheetResultCount(count, shelters, false)).toBe(expected);
    });
  });
});

describe("railResultCount", () => {
  // "Знайдено" is impersonal and governs the ACCUSATIVE, so the one-form is
  // "тварину" — unlike the sheet's "Підходить 1 тварина", which is
  // nominative. Same count, same noun, different case: the two sentences
  // agree at every other count, which is why sharing one form list looks
  // correct in the design's own 34-result example and reads wrong the first
  // time a filter matches exactly one animal.
  it.each([
    [34, 7, "Знайдено 34 тварини у 7 притулках"],
    [1, 1, "Знайдено 1 тварину у 1 притулку"],
    [5, 2, "Знайдено 5 тварин у 2 притулках"],
    [21, 1, "Знайдено 21 тварину у 1 притулку"],
  ])("count=%i shelters=%i -> %s", (count, shelters, expected) => {
    expect(railResultCount(count, shelters)).toBe(expected);
  });
});

describe("showCountLabel", () => {
  it("substitutes the count", () => {
    expect(showCountLabel(12)).toBe("Показати 12");
  });
});
