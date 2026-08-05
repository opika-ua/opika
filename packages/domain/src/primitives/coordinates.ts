import { z } from "zod";

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

/**
 * Carrying the radius alongside the point lets the map draw an honest circle
 * instead of a misleadingly precise pin — the same "say what you don't know"
 * property the freshness badge exists for.
 */
export const ApproximateCoordinatesSchema = z.object({
  center: CoordinatesSchema,
  precisionMetres: z.number().positive(),
});
export type ApproximateCoordinates = z.infer<typeof ApproximateCoordinatesSchema>;

export const LocationPrivacyPolicySchema = z.object({
  fuzzRadiusMetres: z.number().positive(),
});
export type LocationPrivacyPolicy = z.infer<typeof LocationPrivacyPolicySchema>;

export const DEFAULT_LOCATION_PRIVACY_POLICY: LocationPrivacyPolicy = {
  fuzzRadiusMetres: 1000,
};

const METRES_PER_DEGREE_LATITUDE = 111_320;

/** FNV-1a. Deterministic, dependency-free, and adequate for spatial jitter. */
const hashSeed = (seed: string, salt: number): number => {
  let hash = 0x811c9dc5 ^ salt;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
};

/**
 * Offsets a precise location to a stable nearby point.
 *
 * Deterministic on `seed` (the shelter's id) for a security reason, not a
 * testing one: a fresh random offset per request would let an observer average
 * many samples and recover the true position to arbitrary precision. A fixed
 * offset per shelter leaks nothing beyond the first observation.
 *
 * The radial term uses sqrt(u) so points are distributed uniformly over the
 * disc rather than clustering at its centre.
 */
export const fuzzCoordinates = (
  exact: Coordinates,
  seed: string,
  policy: LocationPrivacyPolicy,
): ApproximateCoordinates => {
  const bearingRadians = hashSeed(seed, 0) * 2 * Math.PI;
  const distanceMetres = policy.fuzzRadiusMetres * Math.sqrt(hashSeed(seed, 1));

  const northMetres = distanceMetres * Math.cos(bearingRadians);
  const eastMetres = distanceMetres * Math.sin(bearingRadians);

  const latitudeDelta = northMetres / METRES_PER_DEGREE_LATITUDE;
  const metresPerDegreeLongitude =
    METRES_PER_DEGREE_LATITUDE * Math.cos((exact.lat * Math.PI) / 180);
  const longitudeDelta = metresPerDegreeLongitude === 0 ? 0 : eastMetres / metresPerDegreeLongitude;

  return {
    center: {
      lat: clamp(exact.lat + latitudeDelta, -90, 90),
      lng: wrapLongitude(exact.lng + longitudeDelta),
    },
    precisionMetres: policy.fuzzRadiusMetres,
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const wrapLongitude = (value: number): number => ((((value + 180) % 360) + 360) % 360) - 180;
