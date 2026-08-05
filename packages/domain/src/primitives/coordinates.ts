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

export type LocationPrivacyPolicy = {
  fuzzRadiusMetres: number;
  digest: KeyedUnitDigest;
};

export const DEFAULT_FUZZ_RADIUS_METRES = 1000;

/**
 * FNV-1a over the raw input. Deterministic and dependency-free, and **not
 * keyed** — anyone holding the shelter id can reproduce it.
 *
 * Exported for tests and local seed data only. Deliberately not offered as a
 * default: a default secret is not a secret, and a policy that cannot be
 * constructed without supplying a digest is a policy nobody forgets to key.
 */
export const insecureUnkeyedDigest: KeyedUnitDigest = (input) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
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
