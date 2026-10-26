import { describe, expect, it } from "vitest";
import {
  TEMPERAMENT_TRAITS,
  type Temperament,
  type TemperamentEntry,
  TemperamentSchema,
  type TemperamentTrait,
  TemperamentTraitSchema,
  temperamentTraitsOf,
} from "./temperament";

const preset = (trait: TemperamentTrait): TemperamentEntry => ({
  kind: "preset",
  trait,
});
const custom = (uk: string): TemperamentEntry => ({ kind: "custom", text: { uk, en: null } });

const issuesOf = (value: unknown): string[] => {
  const result = TemperamentSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("TemperamentSchema", () => {
  it("accepts an empty list: nothing recorded is an answer, not a gap", () => {
    expect(TemperamentSchema.safeParse([]).success).toBe(true);
  });

  it("accepts every preset once, in any order, with one custom entry last", () => {
    const all: Temperament = [
      ...[...TEMPERAMENT_TRAITS].reverse().map(preset),
      custom("Боїться грози"),
    ];
    expect(TemperamentSchema.parse(all)).toEqual(all);
  });

  it("accepts a custom entry on its own", () => {
    expect(TemperamentSchema.safeParse([custom("Любить їздити в машині")]).success).toBe(true);
  });

  it("refuses the same preset twice", () => {
    expect(issuesOf([preset("calm"), preset("shy"), preset("calm")])).toEqual([
      "A temperament trait is listed more than once",
    ]);
  });

  it("refuses a second custom entry", () => {
    expect(issuesOf([preset("calm"), custom("Перше"), custom("Друге")])).toEqual([
      "A temperament carries at most one custom entry, and it comes last",
    ]);
  });

  it("refuses a custom entry anywhere but last", () => {
    expect(issuesOf([custom("Спершу своїми словами"), preset("calm")])).toEqual([
      "A temperament carries at most one custom entry, and it comes last",
    ]);
  });

  it("refuses more entries than nine presets and one custom entry can make", () => {
    const tooMany = [...TEMPERAMENT_TRAITS.map(preset), custom("Десятий"), custom("Одинадцятий")];
    expect(tooMany).toHaveLength(TEMPERAMENT_TRAITS.length + 2);
    expect(TemperamentSchema.safeParse(tooMany).success).toBe(false);
  });

  it("refuses an unknown trait and an empty custom text", () => {
    expect(TemperamentSchema.safeParse([{ kind: "preset", trait: "grumpy" }]).success).toBe(false);
    expect(TemperamentSchema.safeParse([custom("")]).success).toBe(false);
  });

  it("lists exactly the enum's traits, so the two can't drift apart", () => {
    expect([...TEMPERAMENT_TRAITS]).toEqual(TemperamentTraitSchema.options);
  });
});

describe("temperamentTraitsOf", () => {
  it("is the presets in their given order, the custom entry stripped", () => {
    expect(
      temperamentTraitsOf([preset("shy"), preset("good_with_cats"), custom("Сам обирає людину")]),
    ).toEqual(["shy", "good_with_cats"]);
  });

  it("is empty for nothing recorded, and for a custom entry alone", () => {
    expect(temperamentTraitsOf([])).toEqual([]);
    expect(temperamentTraitsOf([custom("Своїми словами")])).toEqual([]);
  });

  it("round-trips: presets read back from the column, then the custom entry, give the value stored", () => {
    const stored: Temperament = [preset("energetic"), preset("playful"), custom("Гризе капці")];
    const customEntry = stored.at(-1);
    const rebuilt: Temperament = [
      ...temperamentTraitsOf(stored).map(preset),
      ...(customEntry?.kind === "custom" ? [customEntry] : []),
    ];
    expect(rebuilt).toEqual(stored);
  });
});
