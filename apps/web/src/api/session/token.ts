import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits = 32 bytes, hex-encoded = 64 chars. */
const TOKEN_BYTES = 32;

/**
 * Mint a cryptographically random session token.
 *
 * 256 bits from crypto.randomBytes — not a UUID (122 bits), not
 * Math.random (not cryptographic). The token is the only thing that
 * identifies a session, so it must be unguessable.
 */
export function mintSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * One-way hash of the token for storage.
 *
 * SHA-256 is adequate here: the token has full 256-bit entropy, so
 * brute-forcing the pre-image is infeasible. A password hash (bcrypt,
 * argon2) would add latency on every request for no security gain,
 * because the input is not a human-chosen password.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Timing-safe comparison of two token hashes.
 *
 * Prevents an attacker from learning how many leading bytes of their
 * guess are correct by measuring response time.
 */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
