/**
 * One line per refusal (owner, 2026-10-28), so Vercel's logs show whether real
 * visitors meet a limit: a stable event name and the limiter's name, nothing
 * else. Never the key, address, cookie or adopter: those identify a person.
 */
export type RateLimitedLine = { event: "rate_limited"; limiter: string };

export type RateLimitedLog = (line: RateLimitedLine) => void;

export const consoleRateLimitedLog: RateLimitedLog = (line) => console.warn(line);

export function logRateLimited(limiter: string, log: RateLimitedLog = consoleRateLimitedLog): void {
  log({ event: "rate_limited", limiter });
}
