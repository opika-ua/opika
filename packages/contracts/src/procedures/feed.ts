import { FeedFiltersSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors.js";
import { FeedCardViewSchema } from "../views/animal.js";
import { FeedCursorSchema, pageSizeSchema } from "./pagination.js";

/**
 * A cursor is only valid for the filters it was issued against.
 *
 * Nothing in a schema can bind two sibling fields, so this is a handler
 * obligation: the cursor payload embeds `filtersFingerprint(filters)` from the
 * domain, and a mismatch is INVALID_CURSOR rather than a silently wrong page.
 * Without it, a client that keeps an in-flight cursor across a filter change
 * gets duplicated cards, skipped cards, or cards it explicitly filtered out.
 */
export const FeedListInputSchema = z.object({
  filters: FeedFiltersSchema,
  cursor: FeedCursorSchema.nullable(),
  limit: pageSizeSchema,
});

export const FeedListOutputSchema = z.object({
  items: z.array(FeedCardViewSchema).readonly(),
  /** Null means the feed is exhausted for these filters, not that it failed. */
  nextCursor: FeedCursorSchema.nullable(),
});

export const feedListContract = oc.input(FeedListInputSchema).output(FeedListOutputSchema).errors({
  INVALID_CURSOR: apiErrors.INVALID_CURSOR,
  RATE_LIMITED: apiErrors.RATE_LIMITED,
});
