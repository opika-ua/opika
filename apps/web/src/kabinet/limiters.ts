import { sharedRateLimiter, sharedRedisStore } from "../api/rate-limit";
import {
  inMemoryDelayStore,
  PASSWORD_LIMITS,
  type PasswordLimiters,
  upstashDelayStore,
} from "./password-limits";
import {
  KABINET_RATE_LIMITS,
  PHOTO_CROP_ATTEMPT_LIMITS,
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

/** HS-Q10: never the adopter `apiRateLimiter`. */
export const kabinetLimiters = {
  perUser: sharedRateLimiter({
    name: "kabinet-user",
    ...KABINET_RATE_LIMITS.perUser,
    onUnavailable: "deny",
  }),
  perIp: sharedRateLimiter({
    name: "kabinet-ip",
    ...KABINET_RATE_LIMITS.perIp,
    onUnavailable: "deny",
  }),
};

/** P-Q12: per shelter, an hour and a day; and the crop attempts beside them. */
export const photoUploadLimiters = {
  perHour: sharedRateLimiter({
    name: "kabinet-photo-hour",
    ...PHOTO_UPLOAD_RATE_LIMITS.perHour,
    onUnavailable: "deny",
  }),
  perDay: sharedRateLimiter({
    name: "kabinet-photo-day",
    ...PHOTO_UPLOAD_RATE_LIMITS.perDay,
    onUnavailable: "deny",
  }),
  cropAttempts: {
    perHour: sharedRateLimiter({
      name: "kabinet-crop-attempt-hour",
      ...PHOTO_CROP_ATTEMPT_LIMITS.perHour,
      onUnavailable: "deny",
    }),
    perDay: sharedRateLimiter({
      name: "kabinet-crop-attempt-day",
      ...PHOTO_CROP_ATTEMPT_LIMITS.perDay,
      onUnavailable: "deny",
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
