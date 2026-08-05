import { assertProductionLocationPolicy, fuzzCoordinates } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { hmacDigest, productionLocationPolicy } from "../src/location-policy";

describe("hmacDigest", () => {
  it("returns a value in [0, 1)", () => {
    const digest = hmacDigest("a".repeat(32));
    const value = digest("test-input");
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("is deterministic for the same input", () => {
    const digest = hmacDigest("a".repeat(32));
    expect(digest("shelter-123:bearing")).toBe(digest("shelter-123:bearing"));
  });

  it("produces different values for different inputs", () => {
    const digest = hmacDigest("a".repeat(32));
    expect(digest("shelter-1:bearing")).not.toBe(digest("shelter-2:bearing"));
  });

  it("produces different values for different secrets", () => {
    const d1 = hmacDigest("a".repeat(32));
    const d2 = hmacDigest("b".repeat(32));
    expect(d1("same-input")).not.toBe(d2("same-input"));
  });
});

describe("productionLocationPolicy", () => {
  it("creates a keyed policy that passes assertProductionLocationPolicy", () => {
    const policy = productionLocationPolicy("a".repeat(32));
    expect(policy.assurance).toBe("keyed");
    expect(() => assertProductionLocationPolicy(policy)).not.toThrow();
  });

  it("throws if the secret is too short", () => {
    expect(() => productionLocationPolicy("short")).toThrow(/at least 32 characters/);
  });

  it("produces fuzzed coordinates via the policy", () => {
    const policy = productionLocationPolicy("a".repeat(32));
    const fuzzed = fuzzCoordinates({ lat: 50.45, lng: 30.52 }, "shelter-id", policy);
    expect(fuzzed.center.lat).not.toBe(50.45);
    expect(fuzzed.center.lng).not.toBe(30.52);
    expect(fuzzed.precisionMetres).toBe(1000);
  });
});
