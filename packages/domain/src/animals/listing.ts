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
 */
export const AnimalListingStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft") }),
  z.object({ kind: z.literal("published"), publishedAt: z.date() }),
  z.object({ kind: z.literal("reserved"), since: z.date() }),
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
