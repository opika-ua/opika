import { describe, expect, it } from "vitest";
import { pluralizeUk } from "./plural";

const FORMS = { one: "тварина", few: "тварини", many: "тварин" };

describe("pluralizeUk", () => {
  it.each([
    [1, "тварина"],
    [2, "тварини"],
    [5, "тварин"],
    [11, "тварин"],
    [21, "тварина"],
    [22, "тварини"],
  ])("picks the right form for %i", (count, expected) => {
    expect(pluralizeUk(count, FORMS)).toBe(expected);
  });

  it("treats 0 as many, same as 5-20", () => {
    expect(pluralizeUk(0, FORMS)).toBe("тварин");
  });

  it.each([
    [3, "тварини"],
    [4, "тварини"],
    [12, "тварин"],
    [14, "тварин"],
    [24, "тварини"],
    [25, "тварин"],
  ])("holds through the rest of the teens/twenties boundary for %i", (count, expected) => {
    expect(pluralizeUk(count, FORMS)).toBe(expected);
  });
});
