import { sharedRateLimiter } from "../api/rate-limit";
import { KABINET_RATE_LIMITS, PHOTO_UPLOAD_RATE_LIMITS } from "./rate-limits";
import { SIGN_IN_LIMITS } from "./sign-in-limit";

/**
 * The kabinet's limiter instances, on their own so `proxy.ts` can reach them
 * without loading Better Auth (review of the hardening, finding 3). This
 * module imports nothing heavier than the shared limiter `proxy.ts` already
 * loads for `/tvaryny`; `runtime.ts`, which builds Better Auth, is imported
 * by the proxy only lazily, on a `/kabinet` page load.
 */

export const signInLimiters = {
  perAddress: sharedRateLimiter({ name: "kabinet-sign-in-address", ...SIGN_IN_LIMITS.perAddress }),
  perIp: sharedRateLimiter({ name: "kabinet-sign-in-ip", ...SIGN_IN_LIMITS.perIp }),
};

/** HS-Q10: never the adopter `apiRateLimiter`. */
export const kabinetLimiters = {
  perUser: sharedRateLimiter({ name: "kabinet-user", ...KABINET_RATE_LIMITS.perUser }),
  perIp: sharedRateLimiter({ name: "kabinet-ip", ...KABINET_RATE_LIMITS.perIp }),
};

/** P-Q12: per shelter, an hour and a day. */
export const photoUploadLimiters = {
  perHour: sharedRateLimiter({ name: "kabinet-photo-hour", ...PHOTO_UPLOAD_RATE_LIMITS.perHour }),
  perDay: sharedRateLimiter({ name: "kabinet-photo-day", ...PHOTO_UPLOAD_RATE_LIMITS.perDay }),
};
