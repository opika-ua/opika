import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { ContactRevealViewSchema } from "../views/reveal";
import { pageSizeSchema, RevealCursorSchema } from "./pagination";

export const RevealsListMineInputSchema = z.object({
  cursor: RevealCursorSchema.nullable(),
  limit: pageSizeSchema,
});

export const RevealsListMineOutputSchema = z.object({
  items: z.array(ContactRevealViewSchema).readonly(),
  nextCursor: RevealCursorSchema.nullable(),
});

/**
 * Scoped to the caller's own session by the server, which is why the input
 * carries no adopter id — accepting one would invite passing somebody else's.
 */
export const revealsListMineContract = oc
  .input(RevealsListMineInputSchema)
  .output(RevealsListMineOutputSchema)
  .errors({
    INVALID_CURSOR: apiErrors.INVALID_CURSOR,
    UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
