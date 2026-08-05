import { FeedFiltersSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors.js";
import { FeedCardViewSchema } from "../views/animal.js";
import { FeedCursorSchema, pageSizeSchema } from "./pagination.js";

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
