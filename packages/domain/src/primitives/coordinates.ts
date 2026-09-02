import { z } from "zod";

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

const ApproximateCoordinatesShape = z.object({
  center: CoordinatesSchema,
  precisionMetres: z.number().positive(),
});

/**
 * A location that has actually been offset, distinguishable from a precise one
 * by the type system.
 *
 * The brand exists because `center` would otherwise be an ordinary
 * `Coordinates`, identical to `ExactAddress.coordinates` — so a repository
 * could assign the true position into a public view and every typecheck, every
 * schema parse and every test would still pass, while the map drew a
 * reassuring circle around a pin that was exactly right. `fuzzCoordinates` is
 * the only constructor.
 */
export const FuzzedCoordinatesSchema = ApproximateCoordinatesShape.brand<"FuzzedCoordinates">();
export type FuzzedCoordinates = z.infer<typeof FuzzedCoordinatesSchema>;

/**
 * Produces a value in [0, 1) for the given input.
 *
 * **This must be keyed on a server-held secret.** The offset applied to a
 * shelter is a deterministic function of its id and the published radius, and
 * both of those travel to the client in the same response — so if the
 * derivation can be reproduced from public inputs alone, the true position is
 * recoverable exactly. An HMAC over a server key is the intended
 * implementation; anything unkeyed reduces the fuzzing to decoration.
 */
export type KeyedUnitDigest = (input: string) => number;

/**
 * How much a policy can be trusted, as part of the type rather than as a note
 * in a comment.
 *
 * The previous version documented that the unkeyed digest must never reach
 * production and then shipped it as the only implementation in the repo.
 * Whoever wired this up would have reached for the one thing available, the
 * fuzzing would have quietly become decoration, and nothing anywhere would have
 * failed. A safety property that depends on somebody remembering is not one.
 */
export type LocationPrivacyPolicy =
  | { assurance: "keyed"; fuzzRadiusMetres: number; digest: KeyedUnitDigest }
  | { assurance: "test_only"; fuzzRadiusMetres: number; digest: KeyedUnitDigest };

export const DEFAULT_FUZZ_RADIUS_METRES = 1000;

/**
 * FNV-1a over the raw input. Deterministic and dependency-free, and **not
 * keyed** — anyone holding the shelter id can reproduce it, which is how the
 * original implementation was shown to be exactly invertible from a single
 * public response.
 *
 * Only reachable through `testOnlyLocationPolicy`, so it cannot be passed to a
 * policy that claims to be keyed.
 */
const insecureUnkeyedDigest: KeyedUnitDigest = (input) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
};

/**
 * A policy for tests and local seed data. Its fuzzing is reversible by anyone.
 *
 * The `key` is a label rather than a secret: it exists so two fixtures can
 * produce different offsets, not to protect anything.
 *
 * Throws if called with `NODE_ENV=production` — the guard `assertProduction
 * LocationPolicy` provides is opt-in (only fires if some later step remembers
 * to call it on the constructed value); this one applies the moment the
 * insecure policy is constructed at all, regardless of what happens to it
 * afterward. Closes the exact failure mode this file's own `LocationPrivacy
 * Policy` comment already names: "a safety property that depends on somebody
 * remembering is not one." `packages/db/src/seed.ts` is this function's only
 * production-package caller today, and it never runs with `NODE_ENV=
 * production` set — this only fires if that ever changes, or a future
 * caller copies this function into a real request path by mistake.
 */
export const testOnlyLocationPolicy = (
  key = "test",
  fuzzRadiusMetres: number = DEFAULT_FUZZ_RADIUS_METRES,
): LocationPrivacyPolicy => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "testOnlyLocationPolicy() must never run with NODE_ENV=production. " +
        "Its offsets are reproducible from public data. Use keyedLocationPolicy " +
        "with a server-held secret instead.",
    );
  }
  return {
    assurance: "test_only",
    fuzzRadiusMetres,
    digest: (input) => insecureUnkeyedDigest(`${key} ${input}`),
  };
};

/**
 * The production constructor. `digest` must be keyed on a server-held secret —
 * an HMAC is the intended implementation.
 */
export const keyedLocationPolicy = (
  digest: KeyedUnitDigest,
  fuzzRadiusMetres: number = DEFAULT_FUZZ_RADIUS_METRES,
): LocationPrivacyPolicy => ({ assurance: "keyed", fuzzRadiusMetres, digest });

/**
 * Call at boot, beside `assertFullIcu`.
 *
 * Turns "someone shipped the test policy" from a silent, invisible loss of a
 * safety property into a process that refuses to start.
 */
export const assertProductionLocationPolicy = (policy: LocationPrivacyPolicy): void => {
  if (policy.assurance !== "keyed") {
    throw new Error(
      "Location privacy policy is test-only: its offsets are reproducible from public data. " +
        "Build it with keyedLocationPolicy and a server-held secret.",
    );
  }
};

const METRES_PER_DEGREE_LATITUDE = 111_320;

/**
 * Offsets a precise location to a stable nearby point.
 *
 * Deterministic per shelter, so the displayed point never drifts: a fresh
 * offset per request would let an observer average repeated samples back to the
 * true position. Determinism alone is not enough, though — see
 * `KeyedUnitDigest`. The two draws use distinct labels so bearing and distance
 * are independent.
 *
 * The radial term uses sqrt(u) so points are distributed uniformly over the
 * disc rather than clustering at its centre.
 */
export const fuzzCoordinates = (
  exact: Coordinates,
  seed: string,
  policy: LocationPrivacyPolicy,
): FuzzedCoordinates => {
  const bearingRadians = policy.digest(`${seed}:bearing`) * 2 * Math.PI;
  const distanceMetres = policy.fuzzRadiusMetres * Math.sqrt(policy.digest(`${seed}:radius`));

  const northMetres = distanceMetres * Math.cos(bearingRadians);
  const eastMetres = distanceMetres * Math.sin(bearingRadians);

  const latitudeDelta = northMetres / METRES_PER_DEGREE_LATITUDE;
  const latitude = clamp(exact.lat + latitudeDelta, -90, 90);

  // Longitude degrees shrink towards the poles, so the correction has to use a
  // latitude the point actually sits at. Guarded by magnitude rather than
  // equality: cos(90°) is 6.1e-17 in floating point, never exactly zero, so a
  // strict === check would never fire and would emit a meaningless longitude.
  const metresPerDegreeLongitude =
    METRES_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
  const longitudeDelta =
    Math.abs(metresPerDegreeLongitude) < 1 ? 0 : eastMetres / metresPerDegreeLongitude;

  return FuzzedCoordinatesSchema.parse({
    center: {
      lat: latitude,
      lng: wrapLongitude(exact.lng + longitudeDelta),
    },
    precisionMetres: policy.fuzzRadiusMetres,
  });
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const wrapLongitude = (value: number): number => ((((value + 180) % 360) + 360) % 360) - 180;
