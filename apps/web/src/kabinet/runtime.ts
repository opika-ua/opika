import { after } from "next/server";
import { getDb } from "../api/db";
import { sharedRateLimiter } from "../api/rate-limit";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { kabinetAuthAvailability } from "./auth-route";
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
