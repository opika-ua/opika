import { describe, expect, it } from "vitest";
import { placeLabel } from "./place-label";

describe("placeLabel", () => {
  it.each([
    ["special_status_city", "м. Київ"],
    ["city", "м. Київ"],
    ["selyshche", "с-ще Київ"],
    ["village", "с. Київ"],
  ] as const)("prefixes a %s", (kind, expected) => {
    expect(placeLabel(kind, "Київ")).toBe(expected);
  });
});
