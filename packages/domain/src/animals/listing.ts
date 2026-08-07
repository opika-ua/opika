import { z } from "zod";

/**
 * Why an animal left the feed, kept distinct from the fact that it did.
 * "Adopted" is the outcome the product exists for and deserves to be
 * distinguishable in analytics from a listing that was simply pulled.
 */
export const WithdrawalReasonSchema = z.enum([
  "adopted_elsewhere",
  "transferred",
  "deceased",
  "listing_error",
  "other",
]);
export type WithdrawalReason = z.infer<typeof WithdrawalReasonSchema>;

/**
 * Each state carries the instant it was entered, so "how long has this been
 * reserved" is answerable without a separate event log.
 *
 * `reserved` additionally carries `publishedAt` forward from the state it came
 * from — the same shape, and the same reason, as `suspended` carrying
 * `priorStatus` in the shelter verification FSM. Without it `reserved` would
 * mean both "just became unavailable" (`since`) and "has been available, and
 * waiting, since some earlier date", and a sort named longest-waiting needs
 * the second meaning. A reservation falling through must not have reset the
 * animal's wait clock in the meantime.
 */
export const AnimalListingStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft") }),
  z.object({ kind: z.literal("published"), publishedAt: z.date() }),
  z.object({ kind: z.literal("reserved"), since: z.date(), publishedAt: z.date() }),
  z.object({ kind: z.literal("adopted"), adoptedAt: z.date() }),
  z.object({
    kind: z.literal("withdrawn"),
    withdrawnAt: z.date(),
    reason: WithdrawalReasonSchema,
  }),
]);
export type AnimalListingState = z.infer<typeof AnimalListingStateSchema>;

/**
 * Feed eligibility as data, not only as a predicate.
 *
 * A query builder cannot call a TypeScript function, so persistence would
 * otherwise hand-write `IN ('published','reserved')` with no link back to
 * this file — and adding a listing state later would update the predicate while
 * the SQL kept the old list, silently. The `satisfies` makes that a build
 * failure instead.
 *
 * A reserved animal stays visible deliberately: a reservation can fall through,
 * and hiding it immediately would empty the feed faster than shelters refill it.
 */
export const DISCOVERABLE_LISTING_KINDS = [
  "published",
  "reserved",
] as const satisfies readonly AnimalListingState["kind"][];

export const isDiscoverable = (listing: AnimalListingState): boolean =>
  (DISCOVERABLE_LISTING_KINDS as readonly string[]).includes(listing.kind);

/**
 * When the animal became available to adopters — the value a "longest waiting"
 * ordering sorts on, and `null` for any listing that is not offering the animal
 * to anyone.
 *
 * Deliberately *not* `lastUpdatedAt`: that is edit time, so a shelter fixing a
 * typo would make a dog that has waited four months read as freshly available.
 * Equally deliberately not `reserved.since`, which is when the animal stopped
 * being available — sorting on it would rank the longest-waiting animal in the
 * corpus as the newest the moment someone provisionally spoke for it, and
 * reserved animals stay in the feed precisely because reservations fall
 * through.
 *
 * `null` for `draft`, `adopted` and `withdrawn` because those are not in
 * `DISCOVERABLE_LISTING_KINDS`: no surface that reads this value can show
 * them, so any timestamp here would be a number that exists only to be
 * misread. Persistence stores this in a partial index restricted to the
 * discoverable kinds, so the null costs nothing there either.
 *
 * Mirrors `ageAnchorOf`: a pure derivation persistence writes into an indexed
 * column, so the sort key and the domain state cannot disagree.
 */
export const waitAnchorOf = (listing: AnimalListingState): Date | null => {
  switch (listing.kind) {
    case "published":
      return listing.publishedAt;
    case "reserved":
      // The whole point of `reserved` carrying `publishedAt`: continuous with
      // the `published` state it came from, so the transition does not move
      // the animal in this ordering at all.
      return listing.publishedAt;
    case "draft":
    case "adopted":
    case "withdrawn":
      return null;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = listing;
      return unreachable;
    }
  }
};
