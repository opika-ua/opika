import type { Database } from "@opika/db";
import { revealRepo } from "@opika/db/repos";
import type { AdopterId } from "@opika/domain";
import { ORPCError } from "@orpc/server";

/**
 * Reveal rate limit policy.
 *
 * Shelter contact details are the scrapeable asset. The reveal limit must
 * survive across serverless instances, so it is persisted in Postgres
 * rather than held in memory.
 *
 * Deliberately its own file, not part of `rate-limit.ts`: this one imports
 * `@opika/db/repos`, a Postgres driver dependency. `rate-limit.ts` is also
 * imported from `apps/web/src/middleware.ts`, a separate deployment unit
 * from the route handlers — pulling a DB driver into that bundle would be
 * wrong regardless of what any specific runtime does or doesn't support.
 * Single responsibility here removes the question rather than resolving it.
 */
const REVEAL_RATE_LIMIT = {
  maxReveals: 30,
  windowSeconds: 24 * 3600, // 24 hours
};

/**
 * Check whether the adopter has exceeded the reveal rate limit.
 *
 * Counts reveals in the last `windowSeconds` via the reveal repository,
 * keeping the Drizzle query builder inside `packages/db` where it belongs
 * (standing check: repository boundary).
 *
 * Throws RATE_LIMITED if the limit is exceeded.
 */
export async function checkRevealRateLimit(
  db: Database,
  adopterId: AdopterId,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - REVEAL_RATE_LIMIT.windowSeconds * 1000);

  const reveals = revealRepo(db);
  const recentCount = await reveals.countRecentByAdopter(adopterId, cutoff);

  if (recentCount >= REVEAL_RATE_LIMIT.maxReveals) {
    throw new ORPCError("RATE_LIMITED");
  }
}
