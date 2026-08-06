import { AnimalIdSchema, SwipeDirectionSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";

export type { SwipeDirection } from "@opika/domain";
/**
 * Re-exported rather than declared here. Which animals an adopter has already
 * been shown is a product rule, so it lives in the domain — a transport package
 * defining a domain concept would invert the dependency the packages are
 * arranged around.
 */
export { SwipeDirectionSchema };

export const SwipesRecordInputSchema = z.object({
  animalId: AnimalIdSchema,
  direction: SwipeDirectionSchema,
  /**
   * When the swipe happened, not when it was delivered. Swipes are batchable
   * and may arrive after a reconnect, so the server cannot infer this.
   *
   * Handler obligation, since a schema cannot express "not in the future":
   * clamp to [now - maxOfflineWindow, now]. One device sending year-2999
   * timestamps would otherwise poison every recency window and analytics cohort
   * that orders on this field.
   */
  at: z.date(),
});

export const SwipesRecordOutputSchema = z.object({
  /**
   * Whether the animal was newly added to the seen set. False for a replay,
   * which makes the call safe to retry after a dropped connection.
   */
  recorded: z.boolean(),
});

export const swipesRecordContract = oc
  .input(SwipesRecordInputSchema)
  .output(SwipesRecordOutputSchema)
  .errors({
    NOT_FOUND: apiErrors.NOT_FOUND,
    UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
