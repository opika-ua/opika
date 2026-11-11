import { describe, expect, it } from "vitest";
import { AnimalNameInputSchema, animalNameProblem } from "./animal-name";

describe("animalNameProblem", () => {
  it("accepts an ordinary name", () => {
    expect(animalNameProblem("Мурчик")).toBeNull();
  });

  it.each([["{імʼя}"], ["Бу{"], ["}"], ["{name}"]])("refuses %s, which has a brace", (name) => {
    expect(animalNameProblem(name)).toEqual({ kind: "brace" });
  });

  it("refuses an empty or whitespace-only name", () => {
    expect(animalNameProblem("   ")).toEqual({ kind: "empty" });
  });

  it("accepts exactly 60 characters and refuses 61, measured after trimming", () => {
    expect(animalNameProblem(` ${"я".repeat(60)} `)).toBeNull();
    expect(animalNameProblem("я".repeat(61))).toEqual({
      kind: "too_long",
      characters: 61,
      max: 60,
    });
  });

  it("counts an emoji as one character", () => {
    expect(animalNameProblem("🐾".repeat(60))).toBeNull();
  });
});

describe("AnimalNameInputSchema", () => {
  it("trims the name it accepts", () => {
    expect(AnimalNameInputSchema.parse("  Мурчик ")).toBe("Мурчик");
  });

  it.each([["{імʼя}"], [""], ["я".repeat(61)]])("refuses %s", (name) => {
    expect(AnimalNameInputSchema.safeParse(name).success).toBe(false);
  });
});
