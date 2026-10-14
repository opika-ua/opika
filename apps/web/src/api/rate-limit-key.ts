import { createHmac, randomBytes } from "node:crypto";
import { rateLimitKeySecretProblem } from "./build-env";

/**
 * The one way a client IP becomes a rate-limiter key: `ip:` and an
 * HMAC-SHA256 of the address under `RATE_LIMIT_KEY_SECRET`, base64url.
 *
 * Oleksii, 2026-10-14 (inbox EM-Q11), verbatim: "Rate-limit keys become
 * HMAC(IP) with a dedicated secret RATE_LIMIT_KEY_SECRET (not
 * LOCATION_HMAC_SECRET), on all limiters including the adopter side." Until
 * then the limiters keyed Upstash Redis on the raw address for up to about
 * two hours, while /pro says «IP-адреси не зберігаються».
 *
 * Keyed, not a plain hash: the IPv4 space is 2^32 addresses, so an unkeyed
 * digest is reversed by trying them all in minutes. Under a secret the Redis
 * store holds tokens that only someone holding that secret can link back to
 * an address. Same IP, same secret, same key, so a bucket still counts one
 * caller; a dedicated secret, so rotating it (which resets every bucket) never
 * touches the location fuzzing or the cursors.
 *
 * Every limiter call site goes through this (`rate-limit-key.test.ts` scans
 * for a hand-built `ip:` key anywhere else). The kabinet's per-user and
 * per-address keys are not IPs and stay as they are.
 */
export const ipKeyWith = (secret: string, ip: string): string =>
  `ip:${createHmac("sha256", secret).update(ip, "utf8").digest("base64url")}`;

/**
 * Outside production with no secret set (local dev, CI, unit tests, a
 * Preview): a random key made once per process, never a value written in
 * this repository. A fixed published key would make the Redis keys
 * reversible by anyone who reads the repo, and a developer's machine with
 * the Upstash credentials in `.env.local` writes to the same store. The cost
 * is that buckets don't survive a restart and aren't shared between
 * instances there, which for a minute- or hour-long window is only a looser
 * limit outside production. The harness and the tests that compare keys set
 * a value of their own.
 */
let processKey: string | undefined;

function secretFrom(env: Readonly<Record<string, string | undefined>>): string {
  const problem = rateLimitKeySecretProblem(env);
  // Production with no usable secret: refuse rather than key on anything
  // weaker. The build and boot checks stop this earlier; this is the floor
  // under them if a variable changes after both ran.
  if (problem !== null)
    throw new Error(`Invalid or missing required environment variable: ${problem}`);
  const configured = env.RATE_LIMIT_KEY_SECRET;
  if (configured !== undefined && configured !== "") return configured;
  processKey ??= randomBytes(32).toString("hex");
  return processKey;
}

/** The limiter key for `ip`, under the configured secret (read per call). */
export const ipRateLimitKey = (
  ip: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string => ipKeyWith(secretFrom(env), ip);
