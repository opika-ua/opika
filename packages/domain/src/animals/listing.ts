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
 * The single definition of feed eligibility. A reserved animal stays visible
 * deliberately — a reservation can fall through, and hiding it immediately
 * would empty the feed faster than shelters can refill it.
 */
export const isDiscoverable = (listing: AnimalListingState): boolean =>
  listing.kind === "published" || listing.kind === "reserved";
