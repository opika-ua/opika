import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { uk } from "./messages/uk";

/**
 * A key present in one catalogue and missing from the other fails silently
 * at the type level once these are wired through next-intl (H3) - a runtime
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

/**
 * The code fills `{name}` slots by name, so a slot present in one locale and
 * missing from the other renders a raw brace (or drops a value) in that
 * locale only. Scoped to `kabinet.*`, whose strings are filled by builders and
 * pages; a slot that one locale deliberately leaves out (the invite intro's
 * `{operator}`, moved to the signature) is left out of both.
 */
function leafStrings(value: unknown, prefix: string): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafStrings(child, `${prefix}.${key}`),
  );
}
const slotsOf = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

describe("uk/en kabinet placeholder parity", () => {
  it("every kabinet string carries the same {slots} in both locales", () => {
    const enByPath = new Map(leafStrings(en.kabinet, "kabinet"));
    const mismatched = leafStrings(uk.kabinet, "kabinet")
      .filter(([path, text]) => slotsOf(text).join() !== slotsOf(enByPath.get(path) ?? "").join())
      .map(([path]) => path);
    expect(mismatched).toEqual([]);
  });

  it("would fail if a slot were dropped from one locale", () => {
    expect(slotsOf("Запрошення діє {hours} години.")).toEqual(["{hours}"]);
    expect(slotsOf("The invitation is valid.")).toEqual([]);
  });
});
