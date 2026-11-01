import { describe, expect, it } from "vitest";
import {
  railResultCount,
  sheetResultCount,
  showAnimalsLabel,
  showCountLabel,
} from "./gallery-copy";

/**
 * Audit 2026-10-22 #29 (Oleksii: "#29 must agree for 1, 2, 5, 11, 21 and 22, with tests"):
 * «Підходить 3 тварини» broke agreement for 2-4, so both sheet sentences open with the
 * impersonal «Знайдено», which governs the accusative and agrees at every count. The
 * words are transcribed here per count, never computed with `pluralizeUk`, so a wrong
 * form list can't agree with itself.
 */
const AGREEMENT: ReadonlyArray<readonly [count: number, animals: string, shelters: string]> = [
  [1, "1 тварину", "1 притулку"],
  [2, "2 тварини", "2 притулках"],
  [5, "5 тварин", "5 притулках"],
  [11, "11 тварин", "11 притулках"],
  [21, "21 тварину", "21 притулку"],
  [22, "22 тварини", "22 притулках"],
];

describe("sheetResultCount", () => {
  describe("a city is selected - the audit's «Знайдено …» sentence", () => {
    it.each(AGREEMENT)("count=%i -> Знайдено %s", (count, animals) => {
      expect(sheetResultCount(count, 3, true)).toBe(
        `Знайдено ${animals}. Притулків у цьому місті: 3.`,
      );
    });
  });

  describe("no city selected - 'у цьому місті' would name a city that isn't chosen", () => {
    // The shelter count walks the same six numbers, so «притулку» / «притулках» agree too.
    it.each(AGREEMENT)("shelters=%i -> у %s", (shelters, _animals, shelterPhrase) => {
      expect(sheetResultCount(7, shelters, false)).toBe(`Знайдено 7 тварин у ${shelterPhrase}.`);
    });

    it.each(AGREEMENT)("count=%i -> Знайдено %s", (count, animals) => {
      expect(sheetResultCount(count, 6, false)).toBe(`Знайдено ${animals} у 6 притулках.`);
    });
  });
});

describe("railResultCount", () => {
  // "Знайдено" is impersonal and governs the ACCUSATIVE, so the one-form is
  // "тварину". Since the audit of 2026-10-22 the sheet says the same, so both
  // sentences share one form list (`AGREEMENT` above walks it for the sheet).
  it.each([
    [34, 7, "Знайдено 34 тварини у 7 притулках"],
    [1, 1, "Знайдено 1 тварину у 1 притулку"],
    [5, 2, "Знайдено 5 тварин у 2 притулках"],
    [21, 1, "Знайдено 21 тварину у 1 притулку"],
  ])("count=%i shelters=%i -> %s", (count, shelters, expected) => {
    expect(railResultCount(count, shelters)).toBe(expected);
  });

  it.each(AGREEMENT)("count=%i -> Знайдено %s", (count, animals) => {
    expect(railResultCount(count, 6)).toBe(`Знайдено ${animals} у 6 притулках`);
  });
});

describe("showCountLabel", () => {
  it("substitutes the count", () => {
    expect(showCountLabel(12)).toBe("Показати 12");
  });
});

describe("showAnimalsLabel", () => {
  it.each([
    [1, "Показати 1 тварину"],
    [2, "Показати 2 тварини"],
    [5, "Показати 5 тварин"],
    [11, "Показати 11 тварин"],
    [21, "Показати 21 тварину"],
    [22, "Показати 22 тварини"],
  ])("%i reads «%s»", (count, expected) => {
    expect(showAnimalsLabel(count)).toBe(expected);
  });
});
