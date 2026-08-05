import { createHmac } from "node:crypto";
import {
  assertProductionLocationPolicy,
  type KeyedUnitDigest,
  keyedLocationPolicy,
  type LocationPrivacyPolicy,
} from "@opika/domain";

/**
 * Builds a keyed unit digest backed by HMAC-SHA256 over a server-held secret.
 *
 * The digest maps any string to a deterministic value in [0, 1), so the
 * fuzz offset for a given shelter id is stable across requests (no drift,
 * no averaging attack) and not reproducible from public data.
 *
 * The secret must be at least 32 bytes of entropy (e.g. `openssl rand -hex 32`).
 */
export function hmacDigest(secret: string): KeyedUnitDigest {
  return (input: string): number => {
    const hash = createHmac("sha256", secret).update(input).digest();
    // Read the first 4 bytes as an unsigned 32-bit integer, then normalise to [0, 1).
    const uint32 = hash.readUInt32BE(0);
    return uint32 / 0x100000000;
  };
}

/**
 * The production location policy. Call once at startup, store the result,
 * and pass it to every `publicLocationOf` call.
 *
 * Throws at boot if the secret is missing or too short — this turns
 * "someone deployed without the env var" from a silent privacy loss into
 * a process that refuses to start.
 */
export function productionLocationPolicy(secret: string): LocationPrivacyPolicy {
  if (secret.length < 32) {
    throw new Error(
      "LOCATION_HMAC_SECRET must be at least 32 characters. " +
        "Generate one with: openssl rand -hex 32",
    );
  }
  const policy = keyedLocationPolicy(hmacDigest(secret));
  assertProductionLocationPolicy(policy);
  return policy;
}
