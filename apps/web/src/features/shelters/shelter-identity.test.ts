import { describe, expect, it } from "vitest";
import { isLongShelterName } from "./shelter-identity";

describe("isLongShelterName (a name over 40 characters stacks under the logo)", () => {
  it("40 characters stay beside the logo, 41 stack", () => {
    expect(isLongShelterName("а".repeat(40))).toBe(false);
    expect(isLongShelterName("а".repeat(41))).toBe(true);
  });

  it("ignores surrounding spaces", () => {
    expect(isLongShelterName(`  ${"а".repeat(40)}  `)).toBe(false);
  });
});
