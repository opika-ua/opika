import { describe, expect, it } from "vitest";
import { fitTitle, trimAtWordBoundary, truncateDescription } from "./seo-text";

describe("trimAtWordBoundary", () => {
  it("returns the text unchanged when it already fits", () => {
    expect(trimAtWordBoundary("short text", 160)).toBe("short text");
  });

  it("keeps a cut that already lands exactly on a word boundary - found on review", () => {
    expect(trimAtWordBoundary("abc def ghi", 7)).toBe("abc def");
  });

  it("backs up to the last full word when the cut lands mid-word", () => {
    const text = "Лагідний кіт шукає дім, любить гратися з іграшками та спати на сонці";
    const trimmed = trimAtWordBoundary(text, 30);
    expect(trimmed.length).toBeLessThanOrEqual(30);
    expect(text.startsWith(trimmed)).toBe(true);
    expect(text[trimmed.length]).toBe(" ");
  });

  it("never pads a short text up to the limit", () => {
    expect(trimAtWordBoundary("short", 160)).toBe("short");
  });

  it("cuts at the limit itself when there is no space to back up to", () => {
    expect(trimAtWordBoundary("a".repeat(50), 10)).toBe("a".repeat(10));
  });

  it("an exact-length text is returned whole, not trimmed by one word", () => {
    const text = "exactly ten";
    expect(trimAtWordBoundary(text, text.length)).toBe(text);
  });

  it("collapses internal newlines and other whitespace to a single space - found on review", () => {
    expect(trimAtWordBoundary("Параграф один.\n\nПараграф два.", 160)).toBe(
      "Параграф один. Параграф два.",
    );
  });

  it("treats a non-breaking space as a word break, not part of the word - found on review", () => {
    const text = `перше${" "}друге третє четверте`;
    expect(trimAtWordBoundary(text, 12)).toBe("перше друге");
  });

  it("trims leading/trailing whitespace left over after normalising", () => {
    expect(trimAtWordBoundary("  text with edges  ", 160)).toBe("text with edges");
  });

  it("never splits a surrogate pair (an emoji outside the BMP) - found on review", () => {
    // No space anywhere, so the "cut at the limit" fallback is what's actually
    // exercised - the one path a plain `.slice()` could cut mid-pair.
    const trimmed = trimAtWordBoundary("🐶".repeat(10), 3);
    expect(trimmed).toBe("🐶🐶🐶");
    // A split pair would leave a lone high surrogate as the last UTF-16 code unit.
    expect(/[\uD800-\uDBFF]$/.test(trimmed)).toBe(false);
  });

  it("returns an empty string for a non-positive limit, never a crash", () => {
    expect(trimAtWordBoundary("anything", 0)).toBe("");
    expect(trimAtWordBoundary("anything", -5)).toBe("");
  });
});

describe("fitTitle (SEO handoff B2: 60 characters, drop the brand first)", () => {
  const subject = (length: number) => "а".repeat(length);
  it.each([
    [40, true],
    [52, true],
    [53, false],
    [70, false],
  ])("a %i-character subject keeps the brand: %s", (length, keepsBrand) => {
    const withSite = `${subject(length)} | Opika`;
    expect(fitTitle(withSite, subject(length))).toBe(keepsBrand ? withSite : subject(length));
  });

  it("counts code points, not UTF-16 units", () => {
    const withSite = `${"🐕".repeat(52)} | Opika`;
    expect(Array.from(withSite).length).toBe(60);
    expect(fitTitle(withSite, "🐕")).toBe(withSite);
  });
});

describe("truncateDescription (SEO handoff B2: under 155 characters, «…»)", () => {
  it("returns a text that fits unchanged, with no «…»", () => {
    expect(truncateDescription("Коротко.")).toBe("Коротко.");
    expect(truncateDescription("а".repeat(154))).toBe("а".repeat(154));
  });

  it("cuts a longer one at a word boundary, under 155 with its «…»", () => {
    const text = `${"слово ".repeat(40)}кінець`;
    const cut = truncateDescription(text);
    expect(Array.from(cut).length).toBeLessThan(155);
    expect(cut.endsWith("…")).toBe(true);
    expect(text.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1).endsWith("слово")).toBe(true);
  });

  it.each([
    ["abc def ghi", 8, "abc def…"],
    ["abc, def ghi", 8, "abc…"],
    ["abc – def ghi", 9, "abc…"],
    ["abcdefghij", 5, "abcd…"],
  ])("%j at %i → %j", (text, max, expected) => {
    expect(truncateDescription(text, max)).toBe(expected);
  });

  it("collapses whitespace before measuring", () => {
    expect(truncateDescription("  a\n\nb  ")).toBe("a b");
  });
});
