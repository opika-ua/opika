import {
  DEFAULT_FRESHNESS_POLICY,
  type FreshnessKind,
  freshnessOf,
  type ListingEventType,
  type ListingKind,
  type PublishGap,
} from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { freshnessLabel } from "@opika/ui";
import { missingSentence } from "../animal-form/labels";
import { animalPath, publicAnimalPath } from "../routes";
import { type AnimalRow, metaLineOf, statusLineOf } from "./list-model";

/**
 * The kabinet animal card's view model (types approved by the owner, 2026-11-12): one variant per
 * listing state, so the confirm button, the freshness, the status menu and «Опублікувати» exist only
 * where the spec allows them. Pure: `now` is a parameter.
 */

const t = uk.kabinet.animalList;

/** The FSM events a status menu can carry; publish is the draft's button, confirm and its undo have their own procedures. */
export const STATUS_MENU_EVENTS = [
  "reserve",
  "release",
  "adopt",
  "withdraw",
  "restore_to_draft",
] as const satisfies readonly ListingEventType[];
export type StatusMenuEvent = (typeof STATUS_MENU_EVENTS)[number];

export type MoveBehaviour =
  | { kind: "undoable"; undo: StatusMenuEvent }
  | { kind: "instant" }
  | { kind: "confirm_dialog" }
  | { kind: "reason_dialog" };

/** What each move does (spec §4). Total over the events: a new one fails to compile until it has one. */
export const MOVE_BEHAVIOUR = {
  reserve: { kind: "undoable", undo: "release" },
  release: { kind: "undoable", undo: "reserve" },
  adopt: { kind: "confirm_dialog" },
  withdraw: { kind: "reason_dialog" },
  restore_to_draft: { kind: "instant" },
} as const satisfies Record<StatusMenuEvent, MoveBehaviour>;

/** The menu each state offers: exactly the FSM's legal moves from it, pinned by `status-menu.test.ts`. */
export const STATUS_MENU_FROM = {
  published: ["reserve", "adopt", "withdraw"],
  reserved: ["release", "adopt", "withdraw"],
  withdrawn: ["restore_to_draft"],
} as const satisfies Partial<Record<ListingKind, readonly StatusMenuEvent[]>>;
export type MenuStatus = keyof typeof STATUS_MENU_FROM;

/** One menu entry: its move plus how that move runs, flat so `item.kind` narrows the whole item. */
export type StatusMenuItem<E extends StatusMenuEvent = StatusMenuEvent> = {
  [K in E]: { event: K; label: string } & (typeof MOVE_BEHAVIOUR)[K];
}[E];

export type StatusMenu<S extends MenuStatus> = {
  /** The trigger's accessible name; its visible text is the status itself. */
  label: string;
  items: readonly StatusMenuItem<(typeof STATUS_MENU_FROM)[S][number]>[];
};

/** Release and reserve read as the status they lead to; the «…» items open a dialog first. */
const MENU_LABEL: Record<StatusMenuEvent, string> = {
  reserve: uk.kabinet.listingStatus.reserved,
  release: uk.kabinet.listingStatus.published,
  adopt: t.statusMenu.adopt,
  withdraw: t.statusMenu.withdraw,
  restore_to_draft: t.actions.restore,
};

const statusMenuOf = <S extends MenuStatus>(status: S, name: string): StatusMenu<S> => {
  const events: readonly StatusMenuEvent[] = STATUS_MENU_FROM[status];
  return {
    label: fillTemplate(t.statusMenu.label, { status: uk.kabinet.listingStatus[status], name }),
    // The table types each state's events; the cast only carries that onto the built items.
    items: events.map((event) => ({
      event,
      label: MENU_LABEL[event],
      ...MOVE_BEHAVIOUR[event],
    })) as unknown as StatusMenu<S>["items"],
  };
};

type CardCore = {
  id: AnimalRow["id"];
  name: string;
  /** Photo, name and «Редагувати» all open the edit page (spec rule 5). */
  editHref: string;
  photo: AnimalRow["coverPhoto"];
  /** «Собака · хлопчик · молодий · середній». */
  meta: string;
};

export type CardFreshness = { kind: FreshnessKind; label: string };
/** On every visible card: a link in the freshness line while fresh, the filled button once aging or stale (owner, 2026-11-13). */
export type ConfirmOffer = { label: string; emphasis: "quiet" | "prompt" };
export type PublishOffer =
  | { kind: "ready" }
  | { kind: "blocked"; gaps: readonly [PublishGap, ...PublishGap[]]; sentence: string };
/** A visible card's ⋯: its public page, opened or copied. */
export type SiteLinks = { kind: "site_links"; href: string };
/** A draft's ⋯: only its delete (nothing is public yet). */
export type DraftMore = { kind: "delete_draft" };

export type AnimalManageCard =
  | (CardCore & { status: "draft"; notice: string; publish: PublishOffer; more: DraftMore })
  | (CardCore & {
      status: "published";
      freshness: CardFreshness;
      confirm: ConfirmOffer;
      statusMenu: StatusMenu<"published">;
      more: SiteLinks;
    })
  | (CardCore & {
      status: "reserved";
      freshness: CardFreshness;
      confirm: ConfirmOffer;
      statusMenu: StatusMenu<"reserved">;
      more: SiteLinks;
    })
  | (CardCore & { status: "adopted"; closedLine: string })
  | (CardCore & { status: "withdrawn"; closedLine: string; statusMenu: StatusMenu<"withdrawn"> });

const publishOfferOf = (gaps: readonly PublishGap[]): PublishOffer => {
  const [first, ...rest] = gaps;
  return first === undefined
    ? { kind: "ready" }
    : { kind: "blocked", gaps: [first, ...rest], sentence: missingSentence(gaps) };
};

export const toAnimalManageCard = (row: AnimalRow, now: Date): AnimalManageCard => {
  const core: CardCore = {
    id: row.id,
    name: row.name,
    editHref: animalPath(row.id),
    photo: row.coverPhoto,
    meta: metaLineOf(row, now),
  };
  const { listing } = row;
  switch (listing.kind) {
    case "draft":
      return {
        ...core,
        status: "draft",
        notice: statusLineOf(row, now),
        publish: publishOfferOf(row.publishGaps),
        more: { kind: "delete_draft" },
      };
    case "published":
    case "reserved": {
      const freshness =
        row.freshness ?? freshnessOf(listing.confirmedAt, now, DEFAULT_FRESHNESS_POLICY);
      const visible = {
        freshness: { kind: freshness.kind, label: freshnessLabel(freshness) },
        more: { kind: "site_links", href: publicAnimalPath(row.id) } as const,
      };
      const emphasis = freshness.kind === "fresh" ? "quiet" : "prompt";
      return listing.kind === "published"
        ? {
            ...core,
            ...visible,
            status: "published",
            confirm: { label: t.confirm.stillLooking, emphasis },
            statusMenu: statusMenuOf("published", row.name),
          }
        : {
            ...core,
            ...visible,
            status: "reserved",
            confirm: { label: t.confirm.stillArranging, emphasis },
            statusMenu: statusMenuOf("reserved", row.name),
          };
    }
    case "adopted":
      return { ...core, status: "adopted", closedLine: statusLineOf(row, now) };
    case "withdrawn":
      return {
        ...core,
        status: "withdrawn",
        closedLine: statusLineOf(row, now),
        statusMenu: statusMenuOf("withdrawn", row.name),
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = listing;
      return unreachable;
    }
  }
};
