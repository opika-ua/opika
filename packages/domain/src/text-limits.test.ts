import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelterSchema } from "./shelters/shelter";
import { animalDescriptionProblem, characterCount } from "./text-limits";

describe("characterCount", () => {
  it.each([
    ["Cyrillic letters", "Мурчик", 6],
    ["an emoji with a skin-tone modifier", "\u{1F44B}\u{1F3FD}", 1],
    ["a ZWJ family emoji", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", 1],
    ["a flag", "\u{1F1FA}\u{1F1E6}", 1],
    ["a letter plus a combining acute accent", "е\u0301", 1],
    ["mixed text", "Пес \u{1F43E}!", 6],
  ])("counts %s as a person would", (_label, text, expected) => {
    expect(characterCount(text)).toBe(expected);
  });
});

/**
 * Review finding 3: a browser without `Intl.Segmenter` (Firefox < 125) must be able to load this
 * module, which ships in client bundles, and still get a count. The module is re-imported with the
 * global stubbed, so a segmenter built at load time would throw inside the import itself.
 */
describe("characterCount without Intl.Segmenter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads, and counts code points instead of throwing", async () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    vi.resetModules();
    const fallback = await import("./text-limits");
    // Code points, not UTF-16 units: a paw print is one, though its String.length is 2.
    expect(fallback.characterCount("Пес \u{1F43E}!")).toBe(6);
    // Stricter than graphemes, never looser: a skin-tone emoji is two code points.
    expect(fallback.characterCount("\u{1F44B}\u{1F3FD}")).toBe(2);
  });
});

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
