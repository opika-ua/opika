import { createHash, timingSafeEqual } from "node:crypto";

// Hashing first gives equal-length buffers, so neither the secret's length nor its content leaks through timing.
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Whether an `Authorization` header is exactly `Bearer <secret>`, compared in constant time.
 * Shared by every cron and secret-bearer route so a fix lands in one place (audit part B, item 5).
 * A missing header or an unset or empty secret never matches.
 */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (header === null || secret === undefined || secret === "") return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
