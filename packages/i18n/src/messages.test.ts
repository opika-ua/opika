import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { uk } from "./messages/uk";

/**
 * A key present in one catalogue and missing from the other fails silently
 * at the type level once these are wired through next-intl (H3) — a runtime
 * fallback swallows the gap rather than throwing. This walks both trees and
 * asserts identical key shape, independent of the string values themselves.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("uk/en message catalogue parity", () => {
  it("has an identical key shape in both locales", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(uk).sort());
  });

  it("would fail if a key were removed from one locale", () => {
    const { firstRun: _omitted, ...enWithoutFirstRun } = en;
    expect(keyPaths(enWithoutFirstRun).sort()).not.toEqual(keyPaths(uk).sort());
  });
});
