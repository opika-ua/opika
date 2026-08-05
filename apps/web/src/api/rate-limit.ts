import type { Database } from "@opika/db";
import type { AdopterId } from "@opika/domain";
import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Generic per-IP rate limiter (in-memory)
// ---------------------------------------------------------------------------

/**
 * Interface for a rate limiter. The in-memory implementation below does NOT
 * survive across serverless instances — each cold start gets a fresh Map.
 *
 * Before deploying to production, replace with a shared store (Redis,
 * Postgres advisory locks, or Vercel's KV). The interface is stable; only
 * the backing implementation changes.
 */
export interface RateLimiter {
  /** Returns true if the request is allowed, false if rate-limited. */
  check(key: string, now: Date): boolean;
}

type SlidingWindowEntry = { timestamps: number[] };

/**
 * In-memory sliding-window rate limiter.
 *
 * IMPORTANT: This does not survive serverless cold starts. Each instance
 * maintains its own counter, so the effective limit in production is
 * (limit × number_of_instances). Adequate for development and as a
 * first-line defense; must move to a shared store before deploy.
 */
export function inMemoryRateLimiter(opts: { windowMs: number; maxRequests: number }): RateLimiter {
  const store = new Map<string, SlidingWindowEntry>();

  return {
    check(key: string, now: Date): boolean {
      const nowMs = now.getTime();
      const cutoff = nowMs - opts.windowMs;

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Evict expired timestamps
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      if (entry.timestamps.length >= opts.maxRequests) {
        return false;
      }

      entry.timestamps.push(nowMs);
      return true;
    },
  };
}

/**
 * Default API rate limiter: 100 requests per minute per IP.
 */
export const apiRateLimiter = inMemoryRateLimiter({
  windowMs: 60_000,
  maxRequests: 100,
});

// ---------------------------------------------------------------------------
// Reveal rate limiter (Postgres-persisted)
// ---------------------------------------------------------------------------

/**
 * Reveal rate limit policy.
 *
 * Shelter contact details are the scrapeable asset. The reveal limit must
 * survive across serverless instances, so it is persisted in Postgres
 * rather than held in memory.
 */
const REVEAL_RATE_LIMIT = {
  maxReveals: 30,
  windowSeconds: 24 * 3600, // 24 hours
};

/**
 * Check whether the adopter has exceeded the reveal rate limit.
 *
 * Counts reveals in the last `windowSeconds` from the `reveals` table.
 * This is a read against an indexed column (adopter_id + revealed_at),
 * so it adds one query per reveal — acceptable given reveals are the
 * low-volume, high-value path.
 *
 * Throws RATE_LIMITED if the limit is exceeded.
 */
export async function checkRevealRateLimit(
  db: Database,
  adopterId: AdopterId,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - REVEAL_RATE_LIMIT.windowSeconds * 1000);

  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM reveals
        WHERE adopter_id = ${adopterId}
          AND revealed_at > ${cutoff.toISOString()}::timestamptz`,
  );

  const row = (result as unknown as Array<{ cnt: number }>)[0];
  const count = row?.cnt ?? 0;

  if (count >= REVEAL_RATE_LIMIT.maxReveals) {
    throw new ORPCError("RATE_LIMITED");
  }
}
