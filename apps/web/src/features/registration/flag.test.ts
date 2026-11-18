import { describe, expect, it } from "vitest";
import { isSelfRegistrationEnabled } from "./flag";

describe("isSelfRegistrationEnabled", () => {
  it("is on only for exactly 1", () => {
    expect(isSelfRegistrationEnabled({ SELF_REGISTRATION_ENABLED: "1" })).toBe(true);
  });

  it.each([undefined, "", "0", "true", "yes", " 1", "1 "])("is off for %j", (value) => {
    expect(isSelfRegistrationEnabled({ SELF_REGISTRATION_ENABLED: value })).toBe(false);
  });
});
