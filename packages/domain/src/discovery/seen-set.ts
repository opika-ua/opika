import { z } from "zod";
import { AdopterIdSchema, AnimalIdSchema } from "../primitives/ids";

/**
 * "interested" records which way a card went; it does not itself reveal
 * anything. The reveal is a separate, idempotent action.
 *
 * This lives in the domain rather than beside the procedure that carries it,
 * because which animals an adopter has already been shown is a product rule,
 * not a transport concern — and the contract layer depends on the domain, never
 * the reverse.
 */
export const SwipeDirectionSchema = z.enum(["pass", "interested"]);
export type SwipeDirection = z.infer<typeof SwipeDirectionSchema>;

export const SwipeSchema = z.object({
  adopterId: AdopterIdSchema,
  animalId: AnimalIdSchema,
  direction: SwipeDirectionSchema,
  /** When the swipe happened, not when it arrived — swipes are batched offline. */
  at: z.date(),
});
export type Swipe = z.infer<typeof SwipeSchema>;

export type SeenSetPolicy = {
  /**
   * How many swipes to keep per adopter. The set is sent into every feed query,
   * so it cannot grow without bound; past this, the oldest are dropped and
   * those animals become eligible again.
   */
  maxTracked: number;
  /**
   * Days after which a passed animal may reappear, or `null` to exclude it
   * permanently. A finite window matters most in a small oblast, where an
   * adopter can exhaust the feed in one sitting and would otherwise be shown an
   * empty deck forever.
   */
  reshowAfterDays: number | null;
};

export const DEFAULT_SEEN_SET_POLICY: SeenSetPolicy = {
  maxTracked: 1000,
  reshowAfterDays: 30,
};

const MS_PER_DAY = 86_400_000;

/**
 * Whether a past swipe still excludes its animal from the feed.
 *
 * An "interested" swipe excludes permanently — the adopter has already acted on
 * that animal and showing it again reads as a bug. A "pass" expires, so the
 * deck can refill rather than going empty.
 */
export const stillExcludes = (swipe: Swipe, now: Date, policy: SeenSetPolicy): boolean => {
  if (swipe.direction === "interested") return true;
  if (policy.reshowAfterDays === null) return true;

  const elapsedDays = Math.max(0, now.getTime() - swipe.at.getTime()) / MS_PER_DAY;
  return elapsedDays < policy.reshowAfterDays;
};

/**
 * The exclusion set for a feed query, newest first and capped.
 *
 * Returned as an ordered list rather than a Set because it becomes a query
 * parameter, and the cap is the point: an unbounded array shipped into every
 * feed request is the failure mode to design out before the deck exists, not
 * after.
 */
export const excludedAnimalIds = (
  swipes: readonly Swipe[],
  now: Date,
  policy: SeenSetPolicy,
): readonly string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const swipe of [...swipes].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    if (ordered.length >= policy.maxTracked) break;
    if (!stillExcludes(swipe, now, policy)) continue;
    if (seen.has(swipe.animalId)) continue;
    seen.add(swipe.animalId);
    ordered.push(swipe.animalId);
  }

  return ordered;
};
