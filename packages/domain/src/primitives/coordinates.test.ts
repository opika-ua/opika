import { describe, expect, it } from "vitest";
import {
  type Coordinates,
  DEFAULT_LOCATION_PRIVACY_POLICY,
  fuzzCoordinates,
} from "./coordinates.js";

// Kharkiv, roughly. Any point in the oblast would do.
const EXACT: Coordinates = { lat: 49.9935, lng: 36.2304 };

const distanceMetres = (a: Coordinates, b: Coordinates): number => {
  const earthRadiusMetres = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMetres * Math.asin(Math.sqrt(h));
};

describe("fuzzCoordinates", () => {
  it("is stable for a given seed", () => {
    const first = fuzzCoordinates(EXACT, "shelter-1", DEFAULT_LOCATION_PRIVACY_POLICY);
    const second = fuzzCoordinates(EXACT, "shelter-1", DEFAULT_LOCATION_PRIVACY_POLICY);

    // Not merely convenient for tests: an offset that varied per call would let
    // an observer average repeated samples back to the true position.
    expect(second).toEqual(first);
  });

  it("moves the point off the true position", () => {
    const fuzzed = fuzzCoordinates(EXACT, "shelter-1", DEFAULT_LOCATION_PRIVACY_POLICY);
    expect(distanceMetres(EXACT, fuzzed.center)).toBeGreaterThan(0);
  });

  it("keeps the point inside the declared radius", () => {
    const seeds = Array.from({ length: 200 }, (_, index) => `shelter-${index}`);

    for (const seed of seeds) {
      const fuzzed = fuzzCoordinates(EXACT, seed, DEFAULT_LOCATION_PRIVACY_POLICY);
      expect(distanceMetres(EXACT, fuzzed.center)).toBeLessThanOrEqual(fuzzed.precisionMetres + 1);
    }
  });

  it("reports the policy radius as its precision", () => {
    const fuzzed = fuzzCoordinates(EXACT, "shelter-1", { fuzzRadiusMetres: 250 });
    expect(fuzzed.precisionMetres).toBe(250);
    expect(distanceMetres(EXACT, fuzzed.center)).toBeLessThanOrEqual(251);
  });

  it("gives different shelters different offsets", () => {
    const a = fuzzCoordinates(EXACT, "shelter-a", DEFAULT_LOCATION_PRIVACY_POLICY);
    const b = fuzzCoordinates(EXACT, "shelter-b", DEFAULT_LOCATION_PRIVACY_POLICY);
    expect(a.center).not.toEqual(b.center);
  });
});
