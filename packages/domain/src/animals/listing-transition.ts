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
  z.object({ type: z.literal("undo_confirm"), at: z.date() }),
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
  "undo_confirm",
] as const satisfies readonly ListingEventType[];

/**
 * How long a confirmation stays undoable: K2's 8 seconds plus 5 seconds of
 * slack for a slow connection, so an undo tapped at 7.9 s still lands
 * (H2 S3 addendum §5). Measured on the server's clock from the confirmation
 * being undone.
 */
export const UNDO_WINDOW_MS = 8_000 + 5_000;

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
  | { kind: "non_monotonic"; from: ListingKind; stateTimestamp: Date; eventTimestamp: Date }
  /** `undo_confirm` with nothing undoable: past the window, or after a newer write. */
  | { kind: "undo_expired" };

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

/** The two visible states, the only ones a confirmation can land on. */
type Confirmable = Extract<AnimalListingState, { kind: "published" | "reserved" }>;

/** Whether `confirmable`'s last confirmation can still be undone at `at`. */
const undoableAt = (
  confirmable: Confirmable,
  at: Date,
): confirmable is Confirmable & {
  undoable: NonNullable<Confirmable["undoable"]>;
} =>
  confirmable.undoable !== null &&
  confirmable.undoable.confirmedAt.getTime() === confirmable.confirmedAt.getTime() &&
  at.getTime() - confirmable.undoable.confirmedAt.getTime() <= UNDO_WINDOW_MS;

/**
 * A confirmation records the instant it replaced, so an undo can put it back
 * exactly. A second confirm while the first is still undoable keeps the
 * **original** previous instant and only moves `confirmedAt` (S3-Q1, Oleksii):
 * otherwise confirm, confirm, undo would leave the animal confirmed.
 */
const confirmed = <T extends Confirmable>(current: T, at: Date): T => ({
  ...current,
  confirmedAt: at,
  undoable: {
    previousConfirmedAt: undoableAt(current, at)
      ? current.undoable.previousConfirmedAt
      : current.confirmedAt,
    confirmedAt: at,
  },
});

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
 * `confirm` is a self-loop on the two visible states. It moves `confirmedAt`
 * and records what it replaced in `undoable`, so `undo_confirm` can put it
 * back; nothing else changes. It is one animal per event by construction;
 * there is no bulk form (KABINET N4: a bulk confirm becomes a rubber stamp).
 */
const nextListing = (
  current: AnimalListingState,
  event: ListingEvent,
): AnimalListingState | null => {
  switch (current.kind) {
    case "draft":
      return event.type === "publish"
        ? { kind: "published", publishedAt: event.at, confirmedAt: event.at, undoable: null }
        : null;

    case "published":
      switch (event.type) {
        case "reserve":
          return {
            kind: "reserved",
            since: event.at,
            publishedAt: current.publishedAt,
            confirmedAt: current.confirmedAt,
            undoable: null,
          };
        case "adopt":
          return { kind: "adopted", adoptedAt: event.at };
        case "withdraw":
          return { kind: "withdrawn", withdrawnAt: event.at, reason: event.reason };
        case "confirm":
          return confirmed(current, event.at);
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
            undoable: null,
          };
        case "adopt":
          return { kind: "adopted", adoptedAt: event.at };
        case "withdraw":
          return { kind: "withdrawn", withdrawnAt: event.at, reason: event.reason };
        case "confirm":
          return confirmed(current, event.at);
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
  if (event.type === "undo_confirm") return undoConfirmation(current, event.at);
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
export const PublishGapSchema = z.object({ kind: z.literal("photo") });
export type PublishGap = z.infer<typeof PublishGapSchema>;

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

/**
 * Restores the confirmation a `confirm` replaced, exactly as stored (H2-16).
 * Only on the two visible states, only while the window is open, and only if
 * nothing newer has been written since. Anything else is `undo_expired` rather
 * than `illegal`: the move exists, it just isn't available any more.
 */
const undoConfirmation = (current: AnimalListingState, at: Date): ListingTransitionResult => {
  if (current.kind !== "published" && current.kind !== "reserved") {
    return { kind: "illegal", from: current.kind, event: "undo_confirm" };
  }
  if (at.getTime() < current.confirmedAt.getTime()) {
    return {
      kind: "non_monotonic",
      from: current.kind,
      stateTimestamp: current.confirmedAt,
      eventTimestamp: at,
    };
  }
  if (!undoableAt(current, at)) return { kind: "undo_expired" };
  return {
    kind: "ok",
    next: { ...current, confirmedAt: current.undoable.previousConfirmedAt, undoable: null },
  };
};
