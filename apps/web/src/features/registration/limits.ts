import { type RateLimiter, sharedRateLimiter } from "../../api/rate-limit";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Self-registration's budgets (owner, 2026-11-18): per IP on every submit, per address once the
 * input is valid, the city search the form calls as someone types, and the banner's resend.
 */
export const REGISTRATION_LIMITS = {
  perIpHour: { windowMs: HOUR_MS, maxRequests: 5 },
  perIpDay: { windowMs: DAY_MS, maxRequests: 20 },
  perAddress: { windowMs: HOUR_MS, maxRequests: 3 },
  citySearchPerIp: { windowMs: MINUTE_MS, maxRequests: 60 },
  resendPerUserHour: { windowMs: HOUR_MS, maxRequests: 3 },
  resendPerUserDay: { windowMs: DAY_MS, maxRequests: 6 },
} as const;

/**
 * Confirmation emails (registrations and resends together) the whole site sends in one UTC day;
 * no other mail counts. Owner, 2026-11-18: an abuse alarm (Resend is on Pro), not a quota guard.
 */
export const REGISTRATION_MAIL_DAILY_CAP = 300;

const limiter = (name: string, limits: { windowMs: number; maxRequests: number }) =>
  sharedRateLimiter({ name, ...limits, onUnavailable: "deny" });

/**
 * Shared store in production. An unreachable store refuses: registration is anonymous use
 * (owner, 2026-11-20), so an outage can't open it to floods.
 */
export const registrationLimiters = {
  perIpHour: limiter("registration-ip-hour", REGISTRATION_LIMITS.perIpHour),
  perIpDay: limiter("registration-ip-day", REGISTRATION_LIMITS.perIpDay),
  perAddress: limiter("registration-address", REGISTRATION_LIMITS.perAddress),
  citySearchPerIp: limiter("registration-city-search-ip", REGISTRATION_LIMITS.citySearchPerIp),
  resendPerUserHour: limiter(
    "registration-resend-user-hour",
    REGISTRATION_LIMITS.resendPerUserHour,
  ),
  resendPerUserDay: limiter("registration-resend-user-day", REGISTRATION_LIMITS.resendPerUserDay),
  mailDailyCap: limiter("registration-mail-day", {
    windowMs: DAY_MS,
    maxRequests: REGISTRATION_MAIL_DAILY_CAP,
  }),
};

/**
 * The cap's key: the UTC day. The store's sliding window starts its windows at multiples of the
 * window from the epoch (UTC midnight for a day), so a key that lives one UTC day is an exact,
 * atomic counter; a Kyiv-day key would straddle two windows and let the carry-over admit extra.
 */
export const mailCapKeyOf = (now: Date): string =>
  `registration-mail:${now.toISOString().slice(0, 10)}`;

/** Charges each limiter in order and answers the first that refuses (later ones aren't charged). */
export async function firstRefusal(
  limiters: readonly RateLimiter[],
  key: string,
  now: Date,
): Promise<RateLimiter | null> {
  for (const candidate of limiters) {
    if (!(await candidate.check(key, now))) return candidate;
  }
  return null;
}
