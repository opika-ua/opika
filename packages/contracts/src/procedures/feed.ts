import { FeedFiltersSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { FeedCardViewSchema } from "../views/animal";
import { FeedCursorSchema, pageSizeSchema } from "./pagination";

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
  /**
   * How many animals this caller can still be served under these `filters`,
   * counting from the start of this feed — their own seen-set excluded (R5,
   * replacing R1's `hasActiveSeenSet`, which could only say *whether*
   * anything was excluded, and not under which filters).
   *
   * A snapshot of the feed's start, not a running total: the deck counts
   * its own position up from it (`shownCount`), so a later page must not
   * re-count — by then this caller's own swipes are server-side exclusions
   * and would shrink the total while the position also advanced. Hence:
   *
   * `null` on every prefetch (a call with a non-null `cursor`) — not
   * computed, and nothing to read into it. Also `null` for a caller with no
   * session: nothing can be excluded for them, so whatever total the client
   * already has for these filters (the gallery's) is the honest one. A
   * number only for a fresh fetch by a caller with a session — the one case
   * where the seen-set can make the gallery's total an overstatement.
   */
  reachableCount: z.int().nonnegative().nullable(),
});

export const feedListContract = oc.input(FeedListInputSchema).output(FeedListOutputSchema).errors({
  INVALID_CURSOR: apiErrors.INVALID_CURSOR,
  RATE_LIMITED: apiErrors.RATE_LIMITED,
});
