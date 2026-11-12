import {
  type AnimalListingState,
  LISTING_EVENT_TYPES,
  LISTING_KINDS,
  type ListingEvent,
  type ListingEventType,
  type ListingKind,
  transitionListing,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import { MOVE_BEHAVIOUR, STATUS_MENU_EVENTS, STATUS_MENU_FROM } from "./manage-card";

/**
 * The status-menu table against the listing FSM itself (`transitionListing`), every state and
 * every event: the menu offers exactly the legal moves, and every legal move is offered somewhere.
 * TypeScript can't read the FSM's `switch`, so this test is what keeps the typed table honest.
 */

const T0 = new Date("2026-10-01T09:00:00.000Z");
const T1 = new Date("2026-10-05T09:00:00.000Z");
const T2 = new Date("2026-10-06T09:00:00.000Z");
const REASON = { code: "other", note: null } as const;

const SAMPLE: Record<ListingKind, AnimalListingState> = {
  draft: { kind: "draft" },
  published: { kind: "published", publishedAt: T0, confirmedAt: T0, undoable: null },
  reserved: { kind: "reserved", since: T0, publishedAt: T0, confirmedAt: T0, undoable: null },
  adopted: { kind: "adopted", adoptedAt: T0 },
  withdrawn: { kind: "withdrawn", withdrawnAt: T0, reason: REASON },
};

const eventOf = (type: ListingEventType, at: Date): ListingEvent =>
  type === "withdraw" ? { type, at, reason: REASON } : { type, at };

/** Legality only: `non_monotonic` and `undo_expired` both mean the move exists from this state. */
const legal = (kind: ListingKind, type: ListingEventType): boolean =>
  transitionListing(SAMPLE[kind], eventOf(type, T1)).kind !== "illegal";

const menuOf = (kind: ListingKind): readonly ListingEventType[] =>
  (STATUS_MENU_FROM as Partial<Record<ListingKind, readonly ListingEventType[]>>)[kind] ?? [];

/** Moves a card offers outside its status menu: the draft's «Опублікувати», the confirm button and its undo. */
const OFFERED_OUTSIDE_MENU: Record<ListingKind, readonly ListingEventType[]> = {
  draft: ["publish"],
  published: ["confirm", "undo_confirm"],
  reserved: ["confirm", "undo_confirm"],
  adopted: [],
  withdrawn: [],
};

/** Legal moves no card offers anywhere. Empty since the owner's decision of 2026-11-12. */
const UNOFFERED: readonly string[] = [];

describe("the status menu is the FSM's legal moves, state by state", () => {
  for (const kind of LISTING_KINDS) {
    it.each(STATUS_MENU_EVENTS)(
      `${kind}: %s is in the menu exactly when the FSM allows it`,
      (event) => {
        expect(menuOf(kind).includes(event), `${kind} → ${event}`).toBe(legal(kind, event));
      },
    );
  }

  it("every legal move is offered somewhere: the status menu, «Опублікувати», or the confirm button", () => {
    const unoffered = LISTING_KINDS.flatMap((kind) =>
      LISTING_EVENT_TYPES.filter(
        (type) =>
          legal(kind, type) &&
          !menuOf(kind).includes(type) &&
          !OFFERED_OUTSIDE_MENU[kind].includes(type),
      ).map((type) => `${kind} → ${type}`),
    );
    expect(unoffered).toEqual(UNOFFERED);
  });

  it("nothing outside the menu is offered where the FSM refuses it", () => {
    const dead = LISTING_KINDS.flatMap((kind) =>
      OFFERED_OUTSIDE_MENU[kind]
        .filter((type) => !legal(kind, type))
        .map((type) => `${kind} → ${type}`),
    );
    expect(dead).toEqual([]);
  });
});

describe("an undoable move's undo is its reverse move", () => {
  const undoable = LISTING_KINDS.flatMap((kind) =>
    menuOf(kind).flatMap((event) => {
      const behaviour = MOVE_BEHAVIOUR[event as keyof typeof MOVE_BEHAVIOUR];
      return behaviour.kind === "undoable" ? [[kind, event, behaviour.undo] as const] : [];
    }),
  );

  it("reserve and release are the two", () => {
    expect(undoable.map(([kind, event]) => `${kind} → ${event}`)).toEqual([
      "published → reserve",
      "reserved → release",
    ]);
  });

  it.each(undoable)(
    "%s → %s, then %s: the same state, wait and confirmation dates kept",
    (kind, event, undo) => {
      const moved = transitionListing(SAMPLE[kind], eventOf(event, T1));
      if (moved.kind !== "ok") throw new Error(`${kind} → ${event} refused`);
      const back = transitionListing(moved.next, eventOf(undo, T2));
      if (back.kind !== "ok") throw new Error(`undo ${undo} refused`);
      expect(back.next.kind).toBe(kind);
      const before = SAMPLE[kind];
      if (
        (before.kind === "published" || before.kind === "reserved") &&
        (back.next.kind === "published" || back.next.kind === "reserved")
      ) {
        expect(back.next.publishedAt).toEqual(before.publishedAt);
        expect(back.next.confirmedAt).toEqual(before.confirmedAt);
      }
    },
  );
});
