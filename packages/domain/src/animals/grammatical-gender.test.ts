import { describe, expect, it } from "vitest";
import { grammaticalGenderOf } from "./grammatical-gender";

describe("grammaticalGenderOf (Q9)", () => {
  it.each([
    ["female", "feminine"],
    ["male", "masculine"],
    // «Не записано»: the generic masculine the card already uses, never a guessed feminine.
    ["unknown", "masculine"],
  ] as const)("%s → %s", (sex, gender) => {
    expect(grammaticalGenderOf(sex)).toBe(gender);
  });
});
