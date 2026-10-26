import { describe, expect, it } from "vitest";
import { trimAtWordBoundary } from "./seo-text";

describe("trimAtWordBoundary", () => {
  it("returns the text unchanged when it already fits", () => {
    expect(trimAtWordBoundary("short text", 160)).toBe("short text");
  });

  it("backs up to the last full word, never cutting one in half", () => {
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
});
