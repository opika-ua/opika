import { AnimalIdSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors.js";

/**
 * "interested" does not itself reveal anything — it records that the card was
 * seen and which way it went. The reveal is a separate, explicit call.
 */
export const SwipeDirectionSchema = z.enum(["pass", "interested"]);
export type SwipeDirection = z.infer<typeof SwipeDirectionSchema>;

export const SwipesRecordInputSchema = z.object({
  animalId: AnimalIdSchema,
  direction: SwipeDirectionSchema,
  /**
   * When the swipe happened, not when it was delivered. Swipes are batchable
   * and may arrive after a reconnect, so the server cannot infer this.
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
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
