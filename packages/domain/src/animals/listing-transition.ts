import { z } from "zod";
import type { Animal } from "./animal";
import { type AnimalListingState, WithdrawalReasonSchema } from "./listing";

/**
 * What a shelter can do to a listing (H2, K2's forward actions plus «Ще
 * шукає»). Same shape as the verification FSM: events carry their own
 * instant, and `transitionListing` is the only place a new state is built,
 * so no write path assembles a listing by hand and forgets a field the
 * orderings depend on (`publishedAt`, `confirmedAt`).
 */
export const ListingEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("publish"), at: z.date() }),
  z.object({ type: z.literal("reserve"), at: z.date() }),
  z.object({ type: z.literal("release"), at: z.date() }),
  z.object({ type: z.literal("adopt"), at: z.date() }),
  z.object({ type: z.literal("withdraw"), at: z.date(), reason: WithdrawalReasonSchema }),
  z.object({ type: z.literal("restore_to_draft"), at: z.date() }),
  z.object({ type: z.literal("confirm"), at: z.date() }),
]);
export type ListingEvent = z.infer<typeof ListingEventSchema>;
export type ListingEventType = ListingEvent["type"];

export const LISTING_EVENT_TYPES = [
  "publish",
  "reserve",
  "release",
  "adopt",
  "withdraw",
  "restore_to_draft",
  "confirm",
] as const satisfies readonly ListingEventType[];

export type ListingKind = AnimalListingState["kind"];

export const LISTING_KINDS = [
  "draft",
  "published",
  "reserved",
  "adopted",
  "withdrawn",
] as const satisfies readonly ListingKind[];

/** A result union rather than a thrown error, as in the verification FSM. */
export type ListingTransitionResult =
  | { kind: "ok"; next: AnimalListingState }
  | { kind: "illegal"; from: ListingKind; event: ListingEventType }
  | { kind: "non_monotonic"; from: ListingKind; stateTimestamp: Date; eventTimestamp: Date };

/**
 * The latest instant recorded on a state, or `null` for a draft, which
 * records none. An event dated before it would rewrite history: a
 * confirmation older than the last one, or an adoption before the
 * reservation it ended.
 */
const latestInstantOf = (listing: AnimalListingState): Date | null => {
  switch (listing.kind) {
    case "draft":
      return null;
    case "published":
      return listing.confirmedAt;
    case "reserved":
      return listing.since.getTime() > listing.confirmedAt.getTime()
        ? listing.since
        : listing.confirmedAt;
    case "adopted":
      return listing.adoptedAt;
    case "withdrawn":
      return listing.withdrawnAt;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = listing;
      return unreachable;
    }
  }
};

/**
 * The transition table, as code. `null` for every pair the lifecycle does not
 * permit.
 *
 * Decided with the H2 proposal (inbox H2-7), and recorded there so nobody
 * "fixes" them later:
 *
 * `adopted` is terminal. An animal that comes back after an adoption is a new
 * listing — new id, new URL, wait clock from zero — and this one stays as the
 * record that the adoption happened.
 *
 * `draft -> withdrawn` is closed: a draft is deleted, not withdrawn.
 *
 * `withdrawn -> draft` drops `publishedAt`, so publishing again restarts the
 * wait clock. Withdrawal is "this listing came down", not a pause.
 *
 * `release` (a reservation fell through) keeps both `publishedAt` and
 * `confirmedAt`: the animal has been waiting all along (decision #16), and
 * nobody has newly confirmed anything by the reservation ending.
 *
 * `confirm` is a self-loop on the two visible states and moves nothing but
 * `confirmedAt`. It is one animal per event by construction; there is no
 * bulk form (KABINET N4: a bulk confirm becomes a rubber stamp).
 */
const nextListing = (
  current: AnimalListingState,
  event: ListingEvent,
): AnimalListingState | null => {
  switch (current.kind) {
    case "draft":
      return event.type === "publish"
        ? { kind: "published", publishedAt: event.at, confirmedAt: event.at }
        : null;

    case "published":
      switch (event.type) {
        case "reserve":
          return {
            kind: "reserved",
            since: event.at,
            publishedAt: current.publishedAt,
            confirmedAt: current.confirmedAt,
          };
        case "adopt":
          return { kind: "adopted", adoptedAt: event.at };
        case "withdraw":
          return { kind: "withdrawn", withdrawnAt: event.at, reason: event.reason };
        case "confirm":
          return { ...current, confirmedAt: event.at };
        default:
          return null;
      }

    case "reserved":
      switch (event.type) {
        case "release":
          return {
            kind: "published",
            publishedAt: current.publishedAt,
            confirmedAt: current.confirmedAt,
          };
        case "adopt":
          return { kind: "adopted", adoptedAt: event.at };
        case "withdraw":
          return { kind: "withdrawn", withdrawnAt: event.at, reason: event.reason };
        case "confirm":
          return { ...current, confirmedAt: event.at };
        default:
          return null;
      }

    case "adopted":
      return null;

    case "withdrawn":
      return event.type === "restore_to_draft" ? { kind: "draft" } : null;

    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = current;
      return unreachable;
    }
  }
};

/**
 * Legality before ordering, as in the verification FSM: an event the
 * lifecycle forbids is forbidden whatever its timestamp says.
 */
export const transitionListing = (
  current: AnimalListingState,
  event: ListingEvent,
): ListingTransitionResult => {
  const next = nextListing(current, event);
  if (next === null) {
    return { kind: "illegal", from: current.kind, event: event.type };
  }

  const stateTimestamp = latestInstantOf(current);
  if (stateTimestamp !== null && event.at.getTime() < stateTimestamp.getTime()) {
    return {
      kind: "non_monotonic",
      from: current.kind,
      stateTimestamp,
      eventTimestamp: event.at,
    };
  }

  return { kind: "ok", next };
};

/** One thing that keeps a draft from being published. */
export type PublishGap = { kind: "photo" };

/**
 * Returns what is missing rather than a bare boolean, so K2 can write the
 * reason in the row instead of a disabled button with no explanation
 * (KABINET: «Опублікувати», disabled until there is at least one photo).
 *
 * Separate from `transitionListing` for the same reason `evidenceGaps` is
 * separate from the verification FSM: the table says which moves exist, the
 * gaps say whether this particular animal is ready for one. A publish
 * handler calls both.
 */
export const publishGaps = (animal: Pick<Animal, "photos">): readonly PublishGap[] =>
  animal.photos.length === 0 ? [{ kind: "photo" }] : [];
