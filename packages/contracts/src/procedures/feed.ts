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
   * Whether this caller currently has at least one swipe that still
   * excludes an animal *somewhere* (R1, Phase R, 2026-09-09 — Oleksii's
   * resolution to R1's STOP) — not specifically one under this call's own
   * `filters`. The underlying check is filter-independent: an adopter who
   * has only ever swiped on dogs gets `true` here even on a cats-only
   * feed, where nothing was actually excluded. Deliberately conservative
   * in the direction that matters — the deck's own "N з M" counter and
   * progress bar are computed from the *gallery's* unfiltered total,
   * which has no seen-set exclusion of its own, and `true` only ever
   * suppresses a number that might now be wrong, never asserts one is. A
   * real matching-count field on this procedure — scoped to the actual
   * filters, reporting how many, not just whether any — is the fuller
   * fix, deliberately not built here — its own future row, not this
   * one's scope.
   *
   * `null` means "not computed for this call" — every prefetch (a call
   * with a non-null `cursor`) skips the check entirely rather than paying
   * for it on every page, and `null` here is what tells a caller not to
   * read anything into that. `false` is a real, computed answer: either
   * an authenticated caller with a confirmed-empty seen-set, or an
   * unauthenticated caller (no session, no seen set, always `false`).
   * Collapsing "not computed" into `false` was the original shape — caught
   * on review as conflating two different facts into one value, exactly
   * what `docs/standing-constraints.md`'s "two facts that happen to be
   * true at the same time are not one fact" warns against.
   */
  hasActiveSeenSet: z.boolean().nullable(),
});

export const feedListContract = oc.input(FeedListInputSchema).output(FeedListOutputSchema).errors({
  INVALID_CURSOR: apiErrors.INVALID_CURSOR,
  RATE_LIMITED: apiErrors.RATE_LIMITED,
});
