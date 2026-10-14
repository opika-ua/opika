import { after } from "next/server";
import { getDb } from "../api/db";
import { sharedRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { kabinetAuthAvailability } from "./auth-route";
import { kabinetSessionUserIdOf } from "./principal";
import { KABINET_RATE_LIMITS } from "./rate-limits";
import { SIGN_IN_LIMITS } from "./sign-in-limit";

/**
 * The one Better Auth instance per server process, shared by the sign-in
 * route (`/api/auth/*`) and the kabinet RPC route (`/api/kabinet/*`). Built
 * on first use, not at module scope: `next build` imports both route files.
 * Only ever built when `kabinetAuthAvailability` says so; both routes answer
 * 503 before calling this otherwise.
 */
let cachedAuth: KabinetAuth | undefined;

export function kabinetAuth(): KabinetAuth {
  const availability = kabinetAuthAvailability(process.env);
  if (availability.kind === "unavailable") throw new Error(availability.reason);
  cachedAuth ??= createKabinetAuth({
    db: getDb(),
    sender: availability.sender,
    schedule: (work) => after(work),
    baseURL: availability.baseURL,
    secret: availability.secret,
    secureCookies: availability.baseURL.startsWith("https://"),
  });
  return cachedAuth;
}

export const signInLimiters = {
  perAddress: sharedRateLimiter({ name: "kabinet-sign-in-address", ...SIGN_IN_LIMITS.perAddress }),
  perIp: sharedRateLimiter({ name: "kabinet-sign-in-ip", ...SIGN_IN_LIMITS.perIp }),
};

/** HS-Q10: never the adopter `apiRateLimiter`. */
export const kabinetLimiters = {
  perUser: sharedRateLimiter({ name: "kabinet-user", ...KABINET_RATE_LIMITS.perUser }),
  perIp: sharedRateLimiter({ name: "kabinet-ip", ...KABINET_RATE_LIMITS.perIp }),
};

/**
 * The signed-in user a `/kabinet` page load is charged to (KH-Q8), or null.
 * While sign-in is unavailable there is no session to read, and
 * `kabinetAuth()` would throw: the pages answer 404 then, charged per IP only.
 */
export async function kabinetPageUserId(headers: Headers, now: Date): Promise<string | null> {
  if (kabinetAuthAvailability(process.env).kind === "unavailable") return null;
  return kabinetSessionUserIdOf(kabinetAuth(), headers, now);
}
