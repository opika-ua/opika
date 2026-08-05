import { describe, expect, it } from "vitest";
import { isMachineTranslated, LocalizedTextSchema, textIn } from "./localized-text.js";

const both = LocalizedTextSchema.parse({
  uk: "Лагідний кіт",
  en: { text: "A gentle cat", provenance: "machine" },
});
const ukOnly = LocalizedTextSchema.parse({ uk: "Лагідний кіт", en: null });

describe("textIn", () => {
  it("returns Ukrainian for the uk locale even when English exists", () => {
    expect(textIn(both, "uk")).toBe("Лагідний кіт");
  });

  it("returns English for the en locale", () => {
    expect(textIn(both, "en")).toBe("A gentle cat");
  });

  it("falls back to Ukrainian rather than to an empty string", () => {
    // An untranslated listing should read in the wrong language, not vanish.
    expect(textIn(ukOnly, "en")).toBe("Лагідний кіт");
  });
});

describe("isMachineTranslated", () => {
  it("is true only when the rendered text is machine output", () => {
    expect(isMachineTranslated(both, "en")).toBe(true);
    // The uk text is authored, so no disclaimer belongs on it.
    expect(isMachineTranslated(both, "uk")).toBe(false);
    expect(isMachineTranslated(ukOnly, "en")).toBe(false);
  });

  it("is false for a human translation", () => {
    const human = LocalizedTextSchema.parse({
      uk: "Кіт",
      en: { text: "Cat", provenance: "human" },
    });
    expect(isMachineTranslated(human, "en")).toBe(false);
  });
});

describe("LocalizedTextSchema", () => {
  it("requires Ukrainian text", () => {
    expect(LocalizedTextSchema.safeParse({ uk: "", en: null }).success).toBe(false);
  });

  it("requires a provenance when English is present", () => {
    expect(LocalizedTextSchema.safeParse({ uk: "Кіт", en: { text: "Cat" } }).success).toBe(false);
  });
});
