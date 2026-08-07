import { describe, expect, it } from "vitest";
import { railResultCount, sheetResultCount, showCountLabel } from "./gallery-copy";

describe("sheetResultCount", () => {
  it.each([
    [1, 1, "Підходить 1 тварина. Притулків у цьому місті — 1."],
    [2, 3, "Підходить 2 тварини. Притулків у цьому місті — 3."],
    [12, 3, "Підходить 12 тварин. Притулків у цьому місті — 3."],
  ])("count=%i shelters=%i -> %s", (count, shelters, expected) => {
    expect(sheetResultCount(count, shelters)).toBe(expected);
  });
});

describe("railResultCount", () => {
  it.each([
    [34, 7, "Знайдено 34 тварини у 7 притулках"],
    [1, 1, "Знайдено 1 тварина у 1 притулку"],
    [5, 2, "Знайдено 5 тварин у 2 притулках"],
    [21, 1, "Знайдено 21 тварина у 1 притулку"],
  ])("count=%i shelters=%i -> %s", (count, shelters, expected) => {
    expect(railResultCount(count, shelters)).toBe(expected);
  });
});

describe("showCountLabel", () => {
  it("substitutes the count", () => {
    expect(showCountLabel(12)).toBe("Показати 12");
  });
});
