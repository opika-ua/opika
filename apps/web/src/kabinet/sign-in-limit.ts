import type { RateLimiter } from "../api/rate-limit";
import { ipRateLimitKey } from "../api/rate-limit-key";

/**
 * HS-Q5 (Oleksii): per address 5 links an hour, per IP 20 sign-in requests an
 * hour, on the shared limiter. N1's 60 s resend lockout is the UI's; these are
 * the server's floor under it.
 */
export const SIGN_IN_LIMITS = {
  perAddress: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  perIp: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
} as const;

/**
 * Trimmed and lowercased before it keys anything (HS-Q5), so " Olena@X.ua"
 * and "olena@x.ua" share one budget rather than each getting five.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export type SignInLimiters = { perAddress: RateLimiter; perIp: RateLimiter };

/**
 * Whether a magic-link request may go through. Both budgets are always
 * charged, so alternating addresses from one IP still runs down the IP's.
 *
 * Over either limit, the route answers exactly as it does on success and
 * simply doesn't send: a different answer would tell a caller which
 * addresses are being asked about (no enumeration, N1).
 */
export async function signInAllowed(
  limiters: SignInLimiters,
  request: { email: string; ip: string },
  now: Date,
): Promise<boolean> {
  const [address, ip] = await Promise.all([
    limiters.perAddress.check(`address:${normalizeEmail(request.email)}`, now),
    limiters.perIp.check(ipRateLimitKey(request.ip), now),
  ]);
  return address && ip;
}
