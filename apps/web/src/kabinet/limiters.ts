import { sharedRateLimiter, sharedRedisStore } from "../api/rate-limit";
import {
  inMemoryDelayStore,
  PASSWORD_LIMITS,
  type PasswordLimiters,
  upstashDelayStore,
} from "./password-limits";
import {
  CITY_SEARCH_RATE_LIMITS,
  KABINET_RATE_LIMITS,
  PHOTO_CROP_ATTEMPT_LIMITS,
  PHOTO_UPLOAD_ATTEMPT_LIMITS,
  PHOTO_UPLOAD_RATE_LIMITS,
} from "./rate-limits";
import { SIGN_IN_LIMITS } from "./sign-in-limit";

/**
 * The kabinet's limiter instances, on their own so `proxy.ts` can reach them
 * without loading Better Auth (review of the hardening, finding 3). This
 * module imports nothing heavier than the shared limiter `proxy.ts` already
 * loads for `/tvaryny`; `runtime.ts`, which builds Better Auth, is imported
 * by the proxy only lazily, on a `/kabinet` page load.
 */

export const signInLimiters = {
  perAddress: sharedRateLimiter({
    name: "kabinet-sign-in-address",
    ...SIGN_IN_LIMITS.perAddress,
    onUnavailable: "deny",
  }),
  perIp: sharedRateLimiter({
    name: "kabinet-sign-in-ip",
    ...SIGN_IN_LIMITS.perIp,
    onUnavailable: "deny",
  }),
};

/**
 * HS-Q10: never the adopter `apiRateLimiter`. With the store unreachable (owner, 2026-11-20),
 * signed-in use goes on and anonymous use is refused: `perUser` is only ever charged once a session
 * is validated, so it fails open; `perIp` is charged before any session is read, so it fails closed
 * and the callers that can validate a session ask it through `attemptOf` (`page-limit.ts`,
 * `rpc-route.ts`, `auth.ts`).
 */
export const kabinetLimiters = {
  perUser: sharedRateLimiter({
    name: "kabinet-user",
    ...KABINET_RATE_LIMITS.perUser,
    onUnavailable: "allow",
  }),
  perIp: sharedRateLimiter({
    name: "kabinet-ip",
    ...KABINET_RATE_LIMITS.perIp,
    onUnavailable: "deny",
  }),
};

/** `shelter.cities.search`, per signed-in person; an unreachable store lets it through (2026-11-20). */
export const citySearchLimiter = sharedRateLimiter({
  name: "kabinet-city-search-user",
  ...CITY_SEARCH_RATE_LIMITS.perUser,
  onUnavailable: "allow",
});

/**
 * P-Q12: per shelter, an hour and a day; and the upload and crop attempts beside them. Charged only
 * inside a signed-in admin's procedure, so an unreachable store lets them through (2026-11-20).
 */
export const photoUploadLimiters = {
  perHour: sharedRateLimiter({
    name: "kabinet-photo-hour",
    ...PHOTO_UPLOAD_RATE_LIMITS.perHour,
    onUnavailable: "allow",
  }),
  perDay: sharedRateLimiter({
    name: "kabinet-photo-day",
    ...PHOTO_UPLOAD_RATE_LIMITS.perDay,
    onUnavailable: "allow",
  }),
  uploadAttempts: {
    perHour: sharedRateLimiter({
      name: "kabinet-upload-attempt-hour",
      ...PHOTO_UPLOAD_ATTEMPT_LIMITS.perHour,
      onUnavailable: "allow",
    }),
    perDay: sharedRateLimiter({
      name: "kabinet-upload-attempt-day",
      ...PHOTO_UPLOAD_ATTEMPT_LIMITS.perDay,
      onUnavailable: "allow",
    }),
  },
  cropAttempts: {
    perHour: sharedRateLimiter({
      name: "kabinet-crop-attempt-hour",
      ...PHOTO_CROP_ATTEMPT_LIMITS.perHour,
      onUnavailable: "allow",
    }),
    perDay: sharedRateLimiter({
      name: "kabinet-crop-attempt-day",
      ...PHOTO_CROP_ATTEMPT_LIMITS.perDay,
      onUnavailable: "allow",
    }),
  },
};

/** PW-2, §4.3: «Створіть пароль»'s POST, 20 an hour per IP (the link is single use, so nothing per address). */
export const inviteLimiters = {
  perIp: sharedRateLimiter({
    name: "kabinet-invite-ip",
    ...PASSWORD_LIMITS.invitePerIp,
    onUnavailable: "deny",
  }),
};

const signInDelayStore = sharedRedisStore("kabinet-sign-in-delay");

/** §4.3: «Забули пароль?», a reset link's POST, and the password sign-in's increasing delays. */
export const passwordLimiters: PasswordLimiters = {
  forgotPerIp: sharedRateLimiter({
    name: "kabinet-forgot-ip",
    ...PASSWORD_LIMITS.forgotPerIp,
    onUnavailable: "deny",
  }),
  forgotPerAddress: sharedRateLimiter({
    name: "kabinet-forgot-address",
    ...PASSWORD_LIMITS.forgotPerAddress,
    onUnavailable: "deny",
  }),
  resetPerIp: sharedRateLimiter({
    name: "kabinet-reset-ip",
    ...PASSWORD_LIMITS.resetPerIp,
    onUnavailable: "deny",
  }),
  signInDelay:
    signInDelayStore === null
      ? inMemoryDelayStore()
      : upstashDelayStore(signInDelayStore.redis, signInDelayStore.prefix),
};
