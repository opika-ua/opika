import { describe, expect, it } from "vitest";
import { AnimalColourSchema, COAT_COLOURS, CoatColourSchema } from "./colour";

describe("AnimalColourSchema", () => {
  it("accepts every preset colour", () => {
    for (const colour of COAT_COLOURS) {
      expect(AnimalColourSchema.safeParse({ kind: "preset", colour }).success, colour).toBe(true);
    }
  });

  it("accepts the shelter's own words", () => {
    expect(
      AnimalColourSchema.safeParse({ kind: "custom", text: { uk: "Димчастий", en: null } }).success,
    ).toBe(true);
  });

  it("is one or the other: a preset needs its colour, a custom entry its text", () => {
    expect(AnimalColourSchema.safeParse({ kind: "preset" }).success).toBe(false);
    expect(
      AnimalColourSchema.safeParse({ kind: "preset", text: { uk: "Димчастий", en: null } }).success,
    ).toBe(false);
    expect(AnimalColourSchema.safeParse({ kind: "custom" }).success).toBe(false);
    expect(AnimalColourSchema.safeParse({ kind: "custom", colour: "black" }).success).toBe(false);
    expect(AnimalColourSchema.safeParse({ colour: "black" }).success).toBe(false);
  });

  it("refuses a colour off the list and an empty custom text", () => {
    expect(AnimalColourSchema.safeParse({ kind: "preset", colour: "purple" }).success).toBe(false);
    expect(
      AnimalColourSchema.safeParse({ kind: "custom", text: { uk: "", en: null } }).success,
    ).toBe(false);
  });

  it("is nullable on the animal, «Не вказано» like fur", () => {
    expect(AnimalColourSchema.nullable().safeParse(null).success).toBe(true);
    expect(AnimalColourSchema.safeParse(null).success).toBe(false);
  });

  it("lists exactly the enum's colours, so the two can't drift apart", () => {
    expect([...COAT_COLOURS]).toEqual(CoatColourSchema.options);
  });
});
