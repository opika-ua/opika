import { describe, expect, it } from "vitest";
import {
  assertProductionLocationPolicy,
  type Coordinates,
  DEFAULT_FUZZ_RADIUS_METRES,
  fuzzCoordinates,
  type KeyedUnitDigest,
  keyedLocationPolicy,
  type LocationPrivacyPolicy,
  testOnlyLocationPolicy,
} from "./coordinates";

// Kharkiv, roughly. Any point in the oblast would do.
const EXACT: Coordinates = { lat: 49.9935, lng: 36.2304 };

/**
 * The geometry tests below only need a digest that varies with its input, so
 * the test-only policy is the honest fixture here. What it must never do is
 * silently become the thing production uses — see the last describe block.
 */
const policy = (
  overrides: { digest?: KeyedUnitDigest; fuzzRadiusMetres?: number } = {},
): LocationPrivacyPolicy => {
  const base = testOnlyLocationPolicy("server-key-1", overrides.fuzzRadiusMetres);
  return overrides.digest === undefined ? base : { ...base, digest: overrides.digest };
};

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

const seeds = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => `shelter-${index}`);

describe("the offset cannot be reproduced without the key", () => {
  it("differs between two servers holding different keys", () => {
    // The whole point. If these matched, the offset would be derivable from the
    // shelter id — which ships to every client alongside the fuzzed point.
    const a = fuzzCoordinates(EXACT, "shelter-1", testOnlyLocationPolicy("key-a"));
    const b = fuzzCoordinates(EXACT, "shelter-1", testOnlyLocationPolicy("key-b"));
    expect(a.center).not.toEqual(b.center);
  });

  it("draws bearing and distance from different labels", () => {
    // A digest ignoring its input would tie bearing to distance; a digest
    // ignoring the label would make them equal. Either collapses the offset
    // onto a curve an observer can walk back.
    const seen: string[] = [];
    const recordingDigest: KeyedUnitDigest = (input) => {
      seen.push(input);
      return 0.5;
    };

    fuzzCoordinates(EXACT, "shelter-1", policy({ digest: recordingDigest }));
    expect(new Set(seen).size).toBe(2);
  });
});

describe("stability", () => {
  it("is stable for a given seed and key", () => {
    const p = policy();
    expect(fuzzCoordinates(EXACT, "shelter-1", p)).toEqual(fuzzCoordinates(EXACT, "shelter-1", p));
  });

  it("gives different shelters different offsets", () => {
    const p = policy();
    expect(fuzzCoordinates(EXACT, "shelter-a", p).center).not.toEqual(
      fuzzCoordinates(EXACT, "shelter-b", p).center,
    );
  });
});

describe("the displacement matches the radius it advertises", () => {
  const p = policy();
  const displacements = seeds(500).map((seed) =>
    distanceMetres(EXACT, fuzzCoordinates(EXACT, seed, p).center),
  );
  const sorted = [...displacements].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const mean = displacements.reduce((sum, d) => sum + d, 0) / displacements.length;

  it("never exceeds the declared radius", () => {
    expect(Math.max(...displacements)).toBeLessThanOrEqual(DEFAULT_FUZZ_RADIUS_METRES + 1);
  });

  it("actually uses the radius rather than hugging the true point", () => {
    // Catches a shrunken radius, or sqrt(u) replaced by a higher power — both
    // of which locate the shelter precisely while still reporting 1000 m.
    expect(median).toBeGreaterThan(0.6 * DEFAULT_FUZZ_RADIUS_METRES);
    expect(mean).toBeGreaterThan(0.5 * DEFAULT_FUZZ_RADIUS_METRES);
  });

  it("scales with the policy radius", () => {
    const tight = policy({ fuzzRadiusMetres: 100 });
    const tightMedian = seeds(200)
      .map((seed) => distanceMetres(EXACT, fuzzCoordinates(EXACT, seed, tight).center))
      .sort((a, b) => a - b)[100];
    expect(tightMedian ?? 0).toBeLessThan(100);
  });

  it("reports the policy radius as its precision", () => {
    expect(
      fuzzCoordinates(EXACT, "shelter-1", policy({ fuzzRadiusMetres: 250 })).precisionMetres,
    ).toBe(250);
  });
});

describe("the offset covers every direction", () => {
  it("populates all four quadrants", () => {
    // A pinned bearing would put every shelter in the country on the same
    // heading from its true position.
    const p = policy();
    const quadrants = { ne: 0, nw: 0, se: 0, sw: 0 };
    for (const seed of seeds(400)) {
      const { center } = fuzzCoordinates(EXACT, seed, p);
      const north = center.lat >= EXACT.lat;
      const east = center.lng >= EXACT.lng;
      if (north && east) quadrants.ne += 1;
      else if (north) quadrants.nw += 1;
      else if (east) quadrants.se += 1;
      else quadrants.sw += 1;
    }
    for (const count of Object.values(quadrants)) {
      expect(count).toBeGreaterThan(30);
    }
  });

  it("corrects longitude for latitude, so the circle is round everywhere", () => {
    // Without the cos(latitude) correction the east-west spread shrinks with
    // latitude and the drawn circle stops matching the real uncertainty.
    const p = policy();
    const at = (lat: number) =>
      distanceMetres({ lat, lng: 0 }, fuzzCoordinates({ lat, lng: 0 }, "shelter-1", p).center);

    expect(at(50)).toBeCloseTo(at(0), 0);
    expect(at(70)).toBeCloseTo(at(0), 0);
  });
});

describe("degenerate coordinates", () => {
  it("stays within bounds at the pole, where longitude degrees collapse", () => {
    const result = fuzzCoordinates({ lat: 90, lng: 0 }, "shelter-1", policy());
    expect(result.center.lat).toBeLessThanOrEqual(90);
    expect(result.center.lng).toBeGreaterThanOrEqual(-180);
    expect(result.center.lng).toBeLessThanOrEqual(180);
  });

  it("wraps rather than overflowing at the antimeridian", () => {
    const result = fuzzCoordinates({ lat: 0, lng: 179.999 }, "shelter-1", policy());
    expect(result.center.lng).toBeGreaterThanOrEqual(-180);
    expect(result.center.lng).toBeLessThanOrEqual(180);
  });
});

describe("a test-only policy cannot reach production unnoticed", () => {
  it("refuses to boot on the policy this very file uses", () => {
    // The failure mode being closed: the unkeyed digest used to be the only
    // implementation in the repo, so wiring it up in M2 would have silently
    // reduced the fuzzing to decoration with nothing failing anywhere.
    expect(() => assertProductionLocationPolicy(testOnlyLocationPolicy())).toThrow(/test-only/);
  });

  it("says what to do instead, not just that it refused", () => {
    expect(() => assertProductionLocationPolicy(testOnlyLocationPolicy())).toThrow(
      /keyedLocationPolicy/,
    );
  });

  it("accepts a keyed policy", () => {
    const keyed = keyedLocationPolicy((input) => (input.length % 97) / 97);
    expect(() => assertProductionLocationPolicy(keyed)).not.toThrow();
  });

  it("marks its assurance in the value, so it is inspectable at runtime", () => {
    expect(testOnlyLocationPolicy().assurance).toBe("test_only");
    expect(keyedLocationPolicy(() => 0.5).assurance).toBe("keyed");
  });
});
