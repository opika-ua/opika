import { describe, expect, it } from "vitest";
import { ShelterSchema } from "./shelters/shelter";
import {
  ANIMAL_DESCRIPTION_MAX_CHARACTERS,
  animalDescriptionProblem,
  characterCount,
  SHELTER_DESCRIPTION_TOO_LONG_MESSAGE,
} from "./text-limits";

describe("animalDescriptionProblem", () => {
  it("passes 1,500 characters and flags 1,501, counted as a reader sees them", () => {
    expect(animalDescriptionProblem("я".repeat(1500))).toBeNull();
    expect(animalDescriptionProblem("я".repeat(1501))).toEqual({
      kind: "too_long",
      characters: 1501,
      max: 1500,
    });
    expect(characterCount("🐾".repeat(1500))).toBe(1500);
    expect(animalDescriptionProblem("🐾".repeat(1500))).toBeNull();
  });

  it("names the cap in the fixed shelter message, so the editor can match it", () => {
    expect(ANIMAL_DESCRIPTION_MAX_CHARACTERS).toBe(1500);
    expect(SHELTER_DESCRIPTION_TOO_LONG_MESSAGE).toContain("1500");
  });
});

describe("ShelterSchema.description", () => {
  const shape = ShelterSchema.shape.description;

  it("is nullable", () => {
    expect(shape.safeParse(null).success).toBe(true);
  });

  it("reads a stored text over the cap: only input is capped", () => {
    expect(shape.safeParse({ uk: "я".repeat(1737), en: null }).success).toBe(true);
  });

  it("still refuses a blank Ukrainian text", () => {
    expect(shape.safeParse({ uk: "", en: null }).success).toBe(false);
  });
});
