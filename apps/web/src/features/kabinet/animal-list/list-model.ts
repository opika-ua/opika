import {
  apiErrors,
  type KabinetAnimalListFilter,
  type KabinetAnimalRowView,
  type KabinetAnimalView,
  type KabinetDraftAnimalView,
  type ShelterKabinetContract,
} from "@opika/contracts";
import {
  ageBucketOf,
  DEFAULT_FRESHNESS_POLICY,
  freshnessOf,
  KYIV_TIME_ZONE,
  LISTING_KINDS,
  type ListingKind,
  type PublishGap,
  pluralizeUk,
  type ShelterFacingVerification,
  type WithdrawalReason,
} from "@opika/domain";
import { ageWordFor, fillTemplate, uk } from "@opika/i18n";
import { freshnessLabel } from "@opika/ui";
import type { InferContractRouterOutputs } from "@orpc/contract";
import { publishedAnnouncementOf, type ShelterVisibility } from "../animal-form/labels";

/**
 * K2's words and rules that depend on a value, pure and free of server code,
 * so the page, the client list and their tests share one copy. The strings
 * are Oleksii's (`kabinet.animalList`, 2026-10-18) and the K3 labels his
 * answer 6 reuses; every number and date goes through `Intl`.
 */

const t = uk.kabinet.animalList;

/** One answer of `shelter.animals.list`: a page, the chip counts and the strip's count. */
export type AnimalListPageData =
  InferContractRouterOutputs<ShelterKabinetContract>["shelter"]["animals"]["list"];
export type AnimalListCounts = AnimalListPageData["counts"];
export type AnimalRow = KabinetAnimalRowView;

/**
 * The page size, the same for the server's first page and the browser's next
 * ones: the contract's ceiling (50), so most shelters see every card at once.
 */
export const ANIMAL_LIST_PAGE = 50;

const integer = new Intl.NumberFormat("uk");

/** Every card in the list, adopted and withdrawn included (his answer 6: the header counts cards). */
export const totalOf = (counts: AnimalListCounts): number =>
  LISTING_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

/** «Притулок «Домівка» · 14 карток». */
export const captionOf = (shelterName: string, counts: AnimalListCounts): string => {
  const total = totalOf(counts);
  return fillTemplate(t.caption, {
    shelter: shelterName,
    cards: fillTemplate(pluralizeUk(total, t.captionCards), { count: integer.format(total) }),
  });
};

/** The chips in N3's order: every card, then one per listing kind, each with its inventory count. */
export const filterChipsOf = (
  counts: AnimalListCounts,
): { filter: KabinetAnimalListFilter; label: string }[] => [
  {
    filter: { kind: "all" },
    label: fillTemplate(t.filter.withCount, {
      label: t.filter.all,
      count: integer.format(totalOf(counts)),
    }),
  },
  ...LISTING_KINDS.map((kind) => ({
    filter: { kind: "listing", listing: kind } as const,
    label: fillTemplate(t.filter.withCount, {
      label: t.filter[kind],
      count: integer.format(counts[kind]),
    }),
  })),
];

export const sameFilter = (a: KabinetAnimalListFilter, b: KabinetAnimalListFilter): boolean =>
  a.kind === b.kind && (a.kind !== "listing" || (b.kind === "listing" && a.listing === b.listing));

/**
 * «3 картки ви не підтверджували понад 30 днів.»: `{days}` is the policy's
 * own cut-off, the one the server's stale filter and the pips use, so the
 * number in the sentence is the rule the count was made with.
 */
export const staleLineOf = (count: number): string =>
  fillTemplate(t.stale.count, {
    cards: fillTemplate(pluralizeUk(count, t.stale.countCards), { count: integer.format(count) }),
    days: integer.format(DEFAULT_FRESHNESS_POLICY.agingMaxDays),
  });

const SPECIES: Record<AnimalRow["species"], string> = {
  dog: uk.detail.speciesDog,
  cat: uk.detail.speciesCat,
};
const SEX: Record<AnimalRow["sex"], string> = {
  male: uk.kabinet.animalForm.who.sexMale,
  female: uk.kabinet.animalForm.who.sexFemale,
  unknown: uk.kabinet.profileNotRecorded,
};
const SIZE: Record<NonNullable<AnimalRow["size"]>, string> = {
  small: uk.filters.sizeSmall,
  medium: uk.filters.sizeMedium,
  large: uk.filters.sizeLarge,
};

/**
 * Species · sex · size · age (his answer 6): K3's own segment labels, and
 * the card's age word for the bucket the age is in today, agreeing with the
 * animal's sex as the card's does (Q9: «молода» for a female). A draft's missing
 * size or age is left out rather than written «Не записано»: it is a gap,
 * named in the gap line, not an answer. No foster part (K-Q10).
 */
export const metaLineOf = (row: AnimalRow, now: Date): string =>
  [
    SPECIES[row.species],
    SEX[row.sex],
    ...(row.size === null ? [] : [SIZE[row.size]]),
    ...(row.age === null ? [] : [ageWordFor(ageBucketOf(row.age, now), row.sex)]),
  ].join(" · ");

/** A day on Kyiv's calendar in `Intl`'s words, «12 вересня», with the year when it isn't this one. */
export const dayOf = (date: Date, now: Date): string => {
  const year = (instant: Date) =>
    new Intl.DateTimeFormat("uk-UA", { year: "numeric", timeZone: KYIV_TIME_ZONE }).format(instant);
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    ...(year(date) === year(now) ? {} : { year: "numeric" }),
    timeZone: KYIV_TIME_ZONE,
  }).format(date);
};

/** A withdrawal's `{reason}`: the code's label, then the shelter's own note in «…» when there is one. */
export const withdrawalReasonOf = (reason: WithdrawalReason): string =>
  reason.note === null
    ? t.withdrawReason[reason.code]
    : `${t.withdrawReason[reason.code]} · «${reason.note}»`;

/**
 * The row's line under its meta: for a draft, his F-B2 sentence, true of
 * every draft (his answer 9); for a card people can be shown, how long ago it
 * was confirmed, the public «Оновлено …» (commitment #7: the date that moves
 * only on a confirmation or a photo change); for the closed states, when.
 */
export const statusLineOf = (row: AnimalRow, now: Date): string => {
  const { listing } = row;
  switch (listing.kind) {
    case "draft":
      return uk.kabinet.animalForm.draft.notVisible;
    case "published":
    case "reserved":
      return freshnessLabel(
        row.freshness ?? freshnessOf(listing.confirmedAt, now, DEFAULT_FRESHNESS_POLICY),
      );
    case "adopted":
      return fillTemplate(t.row.adoptedSince, { date: dayOf(listing.adoptedAt, now) });
    case "withdrawn":
      return fillTemplate(t.row.withdrawnOn, {
        date: dayOf(listing.withdrawnAt, now),
        reason: withdrawalReasonOf(listing.reason),
      });
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = listing;
      return unreachable;
    }
  }
};

/** «Ще шукає» on a published card, «Ще домовляються» on a reserved one; nothing else carries the date. */
export const confirmLabelOf = (kind: ListingKind): string | null =>
  kind === "published"
    ? t.confirm.stillLooking
    : kind === "reserved"
      ? t.confirm.stillArranging
      : null;

/** A listing move K2 offers, plus the two actions that aren't moves. */
export type RowAction =
  | "publish"
  | "reserve"
  | "release"
  | "adopt"
  | "withdraw"
  | "restore"
  | "deleteDraft"
  | "edit";

/**
 * Which actions a row offers (K2 sheet §4, with his answers 7 and 8): one
 * forward action beside the row, the rest under «Ще». «Видалити чернетку» is
 * on every draft (K2-T4: whether a draft was ever published stays out of
 * every view), and a refusal is handled when it comes. Adopted is terminal
 * (H2-7), so it offers editing only.
 */
export const rowActionsOf = (
  kind: ListingKind,
): { forward: RowAction | null; menu: readonly RowAction[] } => {
  switch (kind) {
    case "draft":
      return { forward: "publish", menu: ["edit", "deleteDraft"] };
    case "published":
      return { forward: "reserve", menu: ["edit", "adopt", "withdraw"] };
    case "reserved":
      return { forward: "adopt", menu: ["edit", "release", "withdraw"] };
    case "adopted":
      return { forward: null, menu: ["edit"] };
    case "withdrawn":
      return { forward: "restore", menu: ["edit"] };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
};

export const actionLabelOf = (action: RowAction): string =>
  action === "publish" ? uk.kabinet.animalForm.publish.button : t.actions[action];

/** The listing a move leaves the card in, for the re-read after a lost answer. */
export const listingAfter: Record<Exclude<RowAction, "deleteDraft" | "edit">, ListingKind> = {
  publish: "published",
  reserve: "reserved",
  release: "published",
  adopt: "adopted",
  withdraw: "withdrawn",
  restore: "draft",
};

/**
 * What a move announces once it has happened. Publishing reuses K3's
 * announcement, which says people see the card only while the shelter is
 * shown, and «…щойно притулок пройде перевірку» only before a pass (his
 * answer 5; `publishedAnnouncementOf`).
 */
export const movedAnnouncementOf = (
  action: Exclude<RowAction, "deleteDraft" | "edit">,
  name: string,
  visibility: ShelterVisibility,
): string => {
  switch (action) {
    case "publish":
      return publishedAnnouncementOf(visibility);
    case "reserve":
      return fillTemplate(t.moved.reserved, { name });
    case "release":
      return fillTemplate(t.moved.released, { name });
    case "adopt":
      return fillTemplate(t.moved.adopted, { name });
    case "withdraw":
      return fillTemplate(t.moved.withdrawn, { name });
    case "restore":
      return fillTemplate(t.moved.restored, { name });
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled action; unreachable at runtime */
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
};

const isDraftView = (view: KabinetAnimalView): view is KabinetDraftAnimalView =>
  view.listing.kind === "draft";

/**
 * The row after a move, from the animal the server answered: its listing,
 * and the freshness of a card that carries a date, worked out as the server
 * does (`freshnessOf`, the same policy). The publish gaps are kept: a
 * listing move never changes a fact or a photo, so they can't have changed
 * (a draft publishes only with none; a card back in drafts has every fact it
 * was published with).
 */
export const rowAfterMove = (row: AnimalRow, view: KabinetAnimalView, now: Date): AnimalRow => {
  const confirmedAt =
    view.listing.kind === "published" || view.listing.kind === "reserved"
      ? view.listing.confirmedAt
      : null;
  const core = {
    id: view.id,
    name: view.name,
    species: view.species,
    sex: view.sex,
    lastUpdatedAt: view.lastUpdatedAt,
    coverPhoto: view.photos[0] ?? null,
    freshness:
      confirmedAt === null ? null : freshnessOf(confirmedAt, now, DEFAULT_FRESHNESS_POLICY),
    publishGaps: row.publishGaps,
  };
  return isDraftView(view)
    ? { ...core, size: view.size, age: view.age, listing: view.listing }
    : { ...core, size: view.size, age: view.age, listing: view.listing };
};

/** The confirmation date a card shows, or null for a card that carries none. */
export const confirmedAtOf = (listing: AnimalRow["listing"]): Date | null =>
  listing.kind === "published" || listing.kind === "reserved" ? listing.confirmedAt : null;

/**
 * Why a K2 call didn't go through, in the terms the screen speaks. Nothing
 * here reads a refusal's data except the publish gaps: `WAS_PUBLISHED` comes
 * with none, one answer for both of its causes (K-Q9), and the screen shows
 * one sentence for it, so nothing it says can vary with whether anyone swiped
 * or asked about the animal (commitment #2).
 *
 * - `no_answer`: nothing came back (the connection dropped, a timeout); the
 *   server may have done it anyway, so the screen re-reads first (K4-T16).
 * - `rate_limited`: the route's limiter, a plain HTTP 429, which the oRPC
 *   client reports as `TOO_MANY_REQUESTS`.
 */
export type ActionFailure =
  | { kind: "illegal_transition" }
  | { kind: "not_found" }
  | { kind: "publish_unmet"; gaps: readonly PublishGap[] }
  | { kind: "undo_expired" }
  | { kind: "was_published" }
  | { kind: "rate_limited" }
  | { kind: "no_answer" }
  | { kind: "failed" };

const fieldOf = (error: unknown, field: "code" | "data"): unknown =>
  typeof error === "object" && error !== null && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;

export function actionFailureOf(error: unknown): ActionFailure {
  const code = fieldOf(error, "code");
  if (typeof code !== "string") return { kind: "no_answer" };
  switch (code) {
    case "ILLEGAL_TRANSITION":
      return { kind: "illegal_transition" };
    // Another shelter's id reads as not found, as on K3 (copy sheet §1).
    case "NOT_FOUND":
    case "FORBIDDEN":
      return { kind: "not_found" };
    case "PUBLISH_REQUIREMENTS_UNMET": {
      const data = apiErrors.PUBLISH_REQUIREMENTS_UNMET.data.safeParse(fieldOf(error, "data"));
      return data.success ? { kind: "publish_unmet", gaps: data.data.gaps } : { kind: "failed" };
    }
    case "UNDO_EXPIRED":
      return { kind: "undo_expired" };
    case "WAS_PUBLISHED":
      return { kind: "was_published" };
    case "TOO_MANY_REQUESTS":
      return { kind: "rate_limited" };
    default:
      return { kind: "failed" };
  }
}

/**
 * The line that says why nobody sees the shelter's cards, or none while they
 * are shown (his answer 5): paused, his K4 line with the reason and his
 * «Поки прийом на паузі…»; before a pass, his «…щойно притулок пройде
 * перевірку»; rejected or suspended, his R-UI lines.
 */
export type VisibilityNotice =
  | { kind: "none" }
  | { kind: "paused"; line: string }
  | { kind: "line"; text: string };

const longDay = (date: Date): string =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: KYIV_TIME_ZONE,
  }).format(date);

export const visibilityNoticeOf = (verification: ShelterFacingVerification): VisibilityNotice => {
  switch (verification.status) {
    case "verified":
      return { kind: "none" };
    case "paused": {
      const pause = uk.kabinet.profileEdit.pause;
      return {
        kind: "paused",
        line: fillTemplate(pause.pausedLine, {
          date: longDay(verification.since),
          reason: pause.reason[verification.reason.code],
        }),
      };
    }
    case "pending":
    case "under_review":
      return { kind: "line", text: t.notVisible.pending };
    case "rejected":
      return { kind: "line", text: uk.kabinet.verificationDecision.rejectedEffect };
    case "suspended":
      return { kind: "line", text: uk.kabinet.verificationDecision.suspendedEffect };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled status; unreachable at runtime */
    default: {
      const unreachable: never = verification;
      return unreachable;
    }
  }
};
