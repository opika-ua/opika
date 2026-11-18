import { sharedRateLimiter } from "../../api/rate-limit";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Self-registration's budgets (D7, §11.3): per IP on every submit, per address once the input is
 * valid, the city search the form calls as someone types, and the banner's resend.
 */
export const REGISTRATION_LIMITS = {
  perIp: { windowMs: HOUR_MS, maxRequests: 20 },
  perAddress: { windowMs: HOUR_MS, maxRequests: 5 },
  citySearchPerIp: { windowMs: MINUTE_MS, maxRequests: 60 },
  /** «Надіслати ще раз»: enough for a spam folder and a typo, too few to flood an inbox. */
  resendPerUser: { windowMs: HOUR_MS, maxRequests: 3 },
} as const;

/** Shared store in production; an unreachable store refuses, as every kabinet budget does. */
export const registrationLimiters = {
  perIp: sharedRateLimiter({
    name: "registration-ip",
    ...REGISTRATION_LIMITS.perIp,
    onUnavailable: "deny",
  }),
  perAddress: sharedRateLimiter({
    name: "registration-address",
    ...REGISTRATION_LIMITS.perAddress,
    onUnavailable: "deny",
  }),
  citySearchPerIp: sharedRateLimiter({
    name: "registration-city-search-ip",
    ...REGISTRATION_LIMITS.citySearchPerIp,
    onUnavailable: "deny",
  }),
  resendPerUser: sharedRateLimiter({
    name: "registration-resend-user",
    ...REGISTRATION_LIMITS.resendPerUser,
    onUnavailable: "deny",
  }),
};
