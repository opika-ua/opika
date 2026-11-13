"use client";

import "../../../zod-client-config";
import type { KabinetAnimalListFilter, KabinetCursor, KabinetShelterView } from "@opika/contracts";
import { type ListingKind, UNDO_SHOWN_MS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { type ReactNode, useCallback, useRef, useState } from "react";
import {
  type KabinetAnimalListClient,
  kabinetAnimalListBrowserClient,
} from "../../../api/kabinet-browser-client";
import { Button, LinkButton } from "../../../ui/Button";
import { FilterTabs, filterTabId } from "../../../ui/FilterTabs";
import { EmptyState, InlineStatus } from "../../../ui/feedback";
import { Heading } from "../../../ui/Heading";
import { InfoTip } from "../../../ui/InfoTip";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import { type ToastHandle, ToastProvider, useToast } from "../../../ui/Toast";
import type { AnimalFormEditing } from "../animal-form/AnimalForm";
import { cardsArePublic, missingSentence, shelterVisibilityOf } from "../animal-form/labels";
import { NEW_ANIMAL_PATH } from "../routes";
import {
  AnimalManageCard,
  type CardMenu,
  confirmTriggerId,
  moreTriggerId,
  nameLinkId,
  statusTriggerId,
} from "./AnimalManageCard";
import { AdoptDialog, DeleteDialog, type DialogResult, WithdrawDialog } from "./ListDialogs";
import {
  type ActionFailure,
  ANIMAL_LIST_PAGE,
  type AnimalListCounts,
  type AnimalListPageData,
  type AnimalRow,
  actionFailureOf,
  captionOf,
  confirmedAtOf,
  filterChipsOf,
  listingAfter,
  type Move,
  movedAnnouncementOf,
  rowAfterMove,
  sameFilter,
  staleLineOf,
  totalOf,
  visibilityNoticeOf,
} from "./list-model";
import { type StatusMenuItem, toAnimalManageCard } from "./manage-card";

/**
 * K2 · the shelter's animal list (KABINET K2; `docs/k2-copy-sheet.md`), built from the kit.
 *
 * Hierarchy, top to bottom: the page's one filled call to action («Додати тварину»); what
 * governs everything below (a paused or not-yet-shown shelter); the stale strip; the filters;
 * the cards. Confirmations and refusals show in a notice that sticks to the top of the
 * viewport, so a tap on a card far down the list is answered where the eye is.
 *
 * - **Filters** (N3): one chip per listing kind with its inventory count, or
 *   the stale cards (N5's «Показати ці N»), always the server's own filter
 *   (`shelter.animals.list`), never the loaded page filtered here, so a stale
 *   card on a later page is found too (P7).
 * - **Moves** (the card spec, 2026-11-12): the status chip's menu holds what
 *   the FSM allows (`manage-card.ts`). Reserve and release act at once with a
 *   toast whose «Скасувати» runs the reverse move; «Уже вдома…» and «Зняти з
 *   показу…» confirm in a dialog first. A moved card changes in place on «Усі»
 *   and leaves a status tab it no longer belongs to (spec rule 3); no move
 *   touches `lastUpdatedAt`, so none reorders the list (HS-T9). The counts and
 *   the strip are then read again.
 * - **«Ще шукає» / «Ще домовляються»** (N4): one animal per tap, never all
 *   (commitment #7). A toast «{name}: підтверджено сьогодні» offers «Скасувати»
 *   for 8 seconds (owner, 2026-11-13); the server takes the undo for 13 (its
 *   slack), so a tap in the last second still lands, and refuses it after any
 *   newer write (`UNDO_EXPIRED`, RH-B7's photo change included).
 * - **A lost answer** (no response at all): the server may have done it, so
 *   the row is read again before anything is said (K4-T16's pattern).
 * - **Who can act**: `editing` is the page's `decideAccess` answer with the
 *   served policy, so the buttons work exactly where the API accepts them; a
 *   support view sees them disabled (S5).
 * - **Nothing here varies with adopters** (commitment #2): the rows, counts
 *   and refusals are inventory and the shelter's own actions only.
 */

const t = uk.kabinet.animalList;

type Load = { kind: "idle" } | { kind: "loading" } | { kind: "failed" };
type Notice = { kind: "status" | "alert"; text: string } | null;
/** What a re-read after a lost answer found (`reread`). */
type Reread =
  | { kind: "found"; view: Parameters<typeof rowAfterMove>[1] }
  | { kind: "gone" }
  | { kind: "unknown" };

/**
 * After a lost answer whose re-read failed too, the one true thing to say:
 * the card didn't load. His K3 line (`animalForm.errors.loadFailed`), reused
 * rather than a new string; it claims nothing about the date or the move.
 */
const CARD_DIDNT_LOAD = uk.kabinet.animalForm.errors.loadFailed;
/** The re-read found no such card: his K3 not-found sentence, as for NOT_FOUND. */
const NOT_FOUND = uk.kabinet.animalForm.errors.notFound;

/** `returnTo` is the id focus goes back to when the dialog closes (the control that opened it). */
type Dialog = { kind: "adopt" | "withdraw" | "delete"; row: AnimalRow; returnTo: string } | null;

/** How long the reserve/release toast offers its undo (the saved page's undo is 6 s too). */
const MOVE_UNDO_MS = 6_000;

/** A refusal in the screen's words; a lost answer is read again before it gets here. */
const refusalOf = (failure: ActionFailure, otherwise: string): string => {
  switch (failure.kind) {
    case "illegal_transition":
      return uk.kabinet.animalForm.publish.stateChanged;
    case "not_found":
      return uk.kabinet.animalForm.errors.notFound;
    case "publish_unmet":
      return missingSentence(failure.gaps);
    case "undo_expired":
      return t.confirm.undoExpired;
    case "was_published":
      return uk.kabinet.deleteDraft.refused.wasPublished;
    case "rate_limited":
      return t.errors.rateLimited;
    case "no_answer":
    case "failed":
      return otherwise;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled failure; unreachable at runtime */
    default: {
      const unreachable: never = failure;
      return unreachable;
    }
  }
};

type AnimalListProps = {
  shelter: KabinetShelterView;
  first: AnimalListPageData;
  viewer: "admin" | "support";
  editing: AnimalFormEditing;
  client?: KabinetAnimalListClient;
  clock?: () => Date;
  /** Server-rendered notices that govern everything below (rejected, suspended, pending), shown under the title. */
  attention?: ReactNode;
};

/** The list inside the kit's toast region (the confirm and reserve/release undos, «Посилання скопійовано.»). */
export function AnimalList(props: AnimalListProps) {
  return (
    <ToastProvider dismissLabel={uk.kabinet.profileEdit.pause.close}>
      <AnimalListBody {...props} />
    </ToastProvider>
  );
}

function AnimalListBody({
  shelter,
  first,
  viewer,
  editing,
  client = kabinetAnimalListBrowserClient,
  clock = () => new Date(),
  attention = null,
}: AnimalListProps) {
  const toast = useToast();
  const editable = editing.kind === "open" && viewer === "admin";
  const [verification, setVerification] = useState(shelter.verification);
  const [filter, setFilter] = useState<KabinetAnimalListFilter>({ kind: "all" });
  const [items, setItems] = useState<readonly AnimalRow[]>(first.items);
  const [cursor, setCursor] = useState<KabinetCursor | null>(first.nextCursor);
  const [counts, setCounts] = useState<AnimalListCounts>(first.counts);
  const [staleCount, setStaleCount] = useState(first.staleCount);
  const [load, setLoad] = useState<Load>({ kind: "idle" });
  const [more, setMore] = useState<Load>({ kind: "idle" });
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  /** Animal id → its confirmation's undo: offered until when (client clock, ms), and by which toast. */
  const undoOffers = useRef(new Map<string, { until: number; toast: ToastHandle }>());
  const [openMenu, setOpenMenu] = useState<{ id: string; menu: CardMenu } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [resuming, setResuming] = useState(false);
  const loadRequest = useRef(0);
  // Read by the toast's undo, which may run after the filter changed.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const now = clock();
  const visibility = shelterVisibilityOf(verification.status, shelter.earlyListing);
  const shown = cardsArePublic(visibility);
  const visibilityNotice = visibilityNoticeOf(verification, shelter.earlyListing);
  const total = totalOf(counts);

  const setRowBusy = (animalId: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(animalId);
      else next.delete(animalId);
      return next;
    });

  /** Whether a card of this kind stays under the current filter: a status tab keeps only its own. */
  const belongs = (kind: ListingKind) => {
    const current = filterRef.current;
    return current.kind !== "listing" || current.listing === kind;
  };

  /**
   * The card after a write: changed in place, or gone from a status tab it no longer belongs to
   * (spec rule 3). `restore` puts a card an undo brings back where it was.
   */
  const placeRow = (
    view: Parameters<typeof rowAfterMove>[1],
    restore?: { row: AnimalRow; at: number },
  ) =>
    setItems((rows) => {
      const index = rows.findIndex((row) => row.id === view.id);
      if (!belongs(view.listing.kind)) {
        return index === -1 ? rows : rows.filter((row) => row.id !== view.id);
      }
      if (index !== -1) {
        return rows.map((row) => (row.id === view.id ? rowAfterMove(row, view, clock()) : row));
      }
      if (restore === undefined) return rows;
      const next = [...rows];
      next.splice(Math.min(restore.at, next.length), 0, rowAfterMove(restore.row, view, clock()));
      return next;
    });

  const forgetUndo = (animalId: string) => {
    const offer = undoOffers.current.get(animalId);
    undoOffers.current.delete(animalId);
    offer?.toast.dismiss();
  };

  /** The chips' counts and the strip's count, which a move can change; a failure keeps the old ones. */
  const refreshCounts = useCallback(async () => {
    try {
      const page = await client.shelter.animals.list({
        filter: { kind: "all" },
        cursor: null,
        limit: 1,
      });
      setCounts(page.counts);
      setStaleCount(page.staleCount);
    } catch {
      // The rows already say what changed; the counts catch up on the next read.
    }
  }, [client]);

  /**
   * A filter's first page. Every read of the list takes a number from
   * `loadRequest`, and a newer filter's takes a higher one, so an answer to
   * anything older (a first page or a «Показати ще» of the filter just left)
   * is dropped rather than shown under the new chip. Paging starts over with
   * the filter: its cursor is gone until the new first page brings one.
   */
  const loadFirst = async (next: KabinetAnimalListFilter) => {
    const request = ++loadRequest.current;
    setFilter(next);
    setOpenMenu(null);
    setLoad({ kind: "loading" });
    setCursor(null);
    setMore({ kind: "idle" });
    try {
      const page = await client.shelter.animals.list({
        filter: next,
        cursor: null,
        limit: ANIMAL_LIST_PAGE,
      });
      // A newer filter was asked for meanwhile: its answer wins.
      if (request !== loadRequest.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setCounts(page.counts);
      setStaleCount(page.staleCount);
      setLoad({ kind: "idle" });
    } catch {
      if (request === loadRequest.current) setLoad({ kind: "failed" });
    }
  };

  const loadMore = async () => {
    if (cursor === null || more.kind === "loading") return;
    // The filter this page belongs to: a chip changed meanwhile makes it stale (`loadFirst`).
    const request = loadRequest.current;
    setMore({ kind: "loading" });
    try {
      const page = await client.shelter.animals.list({ filter, cursor, limit: ANIMAL_LIST_PAGE });
      if (request !== loadRequest.current) return;
      setItems((rows) => [...rows, ...page.items]);
      setCursor(page.nextCursor);
      setCounts(page.counts);
      setStaleCount(page.staleCount);
      setMore({ kind: "idle" });
    } catch (error) {
      if (request !== loadRequest.current) return;
      // A cursor the server no longer accepts can't be retried into working: start over.
      if ((error as { code?: unknown } | null)?.code === "INVALID_CURSOR") {
        await loadFirst(filter);
        return;
      }
      setMore({ kind: "failed" });
    }
  };

  /**
   * The card as stored, read again after a call whose answer never arrived
   * (K4-T16's pattern): found, gone (NOT_FOUND), or unknown when that read
   * fails too. Only what the read found may be said; with nothing found, the
   * screen says the card didn't load (`CARD_DIDNT_LOAD`) and claims nothing
   * about the date or the move (review of #129, note 1).
   */
  const reread = async (animalId: string): Promise<Reread> => {
    try {
      const view = await client.shelter.animals.byId({ animalId: animalId as AnimalRow["id"] });
      placeRow(view);
      return { kind: "found", view };
    } catch (error) {
      return actionFailureOf(error).kind === "not_found" ? { kind: "gone" } : { kind: "unknown" };
    }
  };

  const announceInNotice = (text: string) => setNotice({ kind: "status", text });

  const runMove = async (
    row: AnimalRow,
    move: Move,
    event: Parameters<KabinetAnimalListClient["shelter"]["animals"]["transition"]>[0]["event"],
    announce: (text: string) => void = announceInNotice,
    restore?: { row: AnimalRow; at: number },
  ): Promise<DialogResult> => {
    setRowBusy(row.id, true);
    setNotice(null);
    try {
      const view = await client.shelter.animals.transition({ animalId: row.id, event });
      placeRow(view, restore);
      forgetUndo(row.id);
      announce(movedAnnouncementOf(move, row.name, visibility));
      void refreshCounts();
      return null;
    } catch (error) {
      const failure = actionFailureOf(error);
      if (failure.kind !== "no_answer") return refusalOf(failure, t.errors.actionFailed);
      const stored = await reread(row.id);
      if (stored.kind === "unknown") return CARD_DIDNT_LOAD;
      if (stored.kind === "gone") return NOT_FOUND;
      // Read back where it was: it didn't move, which «Не вдалося» says.
      if (stored.view.listing.kind !== listingAfter[move]) return t.errors.actionFailed;
      announce(movedAnnouncementOf(move, row.name, visibility));
      void refreshCounts();
      return null;
    } finally {
      setRowBusy(row.id, false);
    }
  };

  const alertOrNull = (refusal: DialogResult) => {
    if (refusal !== null) setNotice({ kind: "alert", text: refusal });
  };

  /**
   * Focus back on a card's control once what it started is done, or on the page title if the card
   * left. `lost` only catches focus the page dropped (the pressed control changed form or went).
   */
  const focusBack = (ids: readonly string[], when: "always" | "lost" = "always") =>
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (when === "lost" && active !== null && active !== document.body) return;
      const target = [...ids, "animal-list-title"]
        .map((id) => document.getElementById(id))
        .find((el) => el !== null);
      target?.focus();
    });

  /** A status-menu move, run the way the FSM table says it runs (`MOVE_BEHAVIOUR`). */
  const onMove = (row: AnimalRow, item: StatusMenuItem) => {
    if (!editable) return;
    const returnTo = statusTriggerId(row.id);
    switch (item.kind) {
      case "confirm_dialog":
        setDialog({ kind: "adopt", row, returnTo });
        return;
      case "reason_dialog":
        setDialog({ kind: "withdraw", row, returnTo });
        return;
      case "instant":
        void runMove(row, item.event, { type: item.event }).then(alertOrNull);
        return;
      case "undoable": {
        const { undo } = item;
        const at = items.findIndex((candidate) => candidate.id === row.id);
        const undone = (text: string) => {
          toast.show(text);
          focusBack([statusTriggerId(row.id), nameLinkId(row.id)]);
        };
        const moved = (text: string) =>
          toast.show(text, "info", {
            durationMs: MOVE_UNDO_MS,
            action: {
              label: uk.kabinet.profileEdit.pause.cancel,
              onAction: () => {
                void runMove(row, undo, { type: undo }, undone, { row, at }).then(alertOrNull);
              },
            },
          });
        void runMove(row, item.event, { type: item.event }, moved).then(alertOrNull);
        return;
      }
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled behaviour; unreachable at runtime */
      default: {
        const unreachable: never = item;
        return unreachable;
      }
    }
  };

  const copyLink = async (href: string) => {
    if (typeof navigator.clipboard?.writeText !== "function") return;
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      toast.show(uk.detail.shareCopied, "success");
    } catch {
      // No clipboard permission or a non-secure context: nothing was copied, so nothing is said.
    }
  };

  const deleteDraft = async (row: AnimalRow): Promise<DialogResult> => {
    setRowBusy(row.id, true);
    setNotice(null);
    const deleted = () => {
      setItems((rows) => rows.filter((candidate) => candidate.id !== row.id));
      setNotice({ kind: "status", text: fillTemplate(t.deleted, { name: row.name }) });
      void refreshCounts();
      return null;
    };
    try {
      await client.shelter.animals.deleteDraft({ animalId: row.id });
      return deleted();
    } catch (error) {
      const failure = actionFailureOf(error);
      if (failure.kind !== "no_answer") return refusalOf(failure, t.errors.actionFailed);
      const stored = await reread(row.id);
      if (stored.kind === "gone") return deleted();
      // Still there: it wasn't deleted, which «Не вдалося» says.
      return stored.kind === "found" ? t.errors.actionFailed : CARD_DIDNT_LOAD;
    } finally {
      setRowBusy(row.id, false);
    }
  };

  const confirm = async (row: AnimalRow) => {
    if (!editable) return;
    setRowBusy(row.id, true);
    setNotice(null);
    try {
      const { animal } = await client.shelter.animals.confirm({ animalId: row.id });
      placeRow(animal);
      // The undo reads the card as it now shows: today's date.
      offerUndo(rowAfterMove(row, animal, clock()), clock().getTime() + UNDO_SHOWN_MS);
      void refreshCounts();
    } catch (error) {
      const failure = actionFailureOf(error);
      if (failure.kind !== "no_answer") {
        setNotice({ kind: "alert", text: refusalOf(failure, t.confirm.failed) });
        return;
      }
      const stored = await reread(row.id);
      if (stored.kind !== "found") {
        setNotice({ kind: "alert", text: stored.kind === "gone" ? NOT_FOUND : CARD_DIDNT_LOAD });
        return;
      }
      const before = confirmedAtOf(row.listing)?.getTime();
      const after = confirmedAtOf(stored.view.listing)?.getTime();
      if (after !== undefined && after !== before) {
        // It went through: the date moved. The undo's window isn't known, so none is offered.
        forgetUndo(row.id);
        toast.show(fillTemplate(t.confirm.doneNamed, { name: row.name }));
        void refreshCounts();
        return;
      }
      // Read back unchanged: «…дата на картці не змінилася» is what the read showed.
      setNotice({ kind: "alert", text: t.confirm.failed });
    } finally {
      setRowBusy(row.id, false);
    }
  };

  /**
   * «{name}: підтверджено сьогодні» with «Скасувати» until `until`, one toast per animal. The
   * action keeps the offer, so an undo that fails but may still land is offered again for the rest.
   */
  const offerUndo = (row: AnimalRow, until: number) => {
    forgetUndo(row.id);
    const left = until - clock().getTime();
    if (left <= 0) return;
    const handle = toast.show(fillTemplate(t.confirm.doneNamed, { name: row.name }), "info", {
      durationMs: left,
      action: { label: uk.kabinet.profileEdit.pause.cancel, onAction: () => void undo(row) },
      onClose: (reason) => {
        if (reason !== "action" && undoOffers.current.get(row.id)?.toast === handle) {
          undoOffers.current.delete(row.id);
        }
      },
    });
    undoOffers.current.set(row.id, { until, toast: handle });
  };

  const undo = async (row: AnimalRow) => {
    if (!editable) return;
    setRowBusy(row.id, true);
    setNotice(null);
    // The toast that ran this is gone; it comes back only if the undo may still be retried.
    const offer = undoOffers.current.get(row.id);
    undoOffers.current.delete(row.id);
    const offerAgain = () => {
      if (offer !== undefined) offerUndo(row, offer.until);
    };
    try {
      const view = await client.shelter.animals.undoConfirm({ animalId: row.id });
      placeRow(view);
      setNotice({ kind: "status", text: t.confirm.undone });
      void refreshCounts();
    } catch (error) {
      const failure = actionFailureOf(error);
      // An expired undo may be this undo's own earlier attempt, landed with
      // its answer lost: the card is read before anything is said about its date.
      if (failure.kind !== "no_answer" && failure.kind !== "undo_expired") {
        if (failure.kind !== "illegal_transition") offerAgain();
        setNotice({ kind: "alert", text: refusalOf(failure, t.errors.actionFailed) });
        return;
      }
      const stored = await reread(row.id);
      if (stored.kind !== "found") {
        if (stored.kind === "unknown" && failure.kind === "no_answer") offerAgain();
        setNotice({ kind: "alert", text: stored.kind === "gone" ? NOT_FOUND : CARD_DIDNT_LOAD });
        return;
      }
      const shownAt = confirmedAtOf(row.listing)?.getTime();
      const storedAt = confirmedAtOf(stored.view.listing)?.getTime();
      if (shownAt !== undefined && storedAt !== undefined && storedAt < shownAt) {
        setNotice({ kind: "status", text: t.confirm.undone });
        void refreshCounts();
        return;
      }
      // Read back with today's date: an expired undo says so; a lost one simply didn't happen.
      if (failure.kind === "no_answer") offerAgain();
      setNotice({
        kind: "alert",
        text: failure.kind === "undo_expired" ? t.confirm.undoExpired : t.errors.actionFailed,
      });
    } finally {
      setRowBusy(row.id, false);
      focusBack([confirmTriggerId(row.id), nameLinkId(row.id)], "lost");
    }
  };

  const resume = async () => {
    if (!editable || resuming) return;
    setResuming(true);
    setNotice(null);
    try {
      const view = await client.shelter.profile.resume({});
      setVerification(view.verification);
      setNotice({ kind: "status", text: uk.kabinet.profileEdit.pause.resumed });
    } catch (error) {
      const failure = actionFailureOf(error);
      setNotice({
        kind: "alert",
        text:
          failure.kind === "illegal_transition"
            ? uk.kabinet.profileEdit.errors.illegalTransitionResume
            : uk.kabinet.profileEdit.state.failed,
      });
    } finally {
      setResuming(false);
    }
  };

  // Focus back where the dialog was opened from, then the card's name, then the page title.
  const closeDialog = () => {
    const opened = dialog;
    setDialog(null);
    if (opened !== null) focusBack([opened.returnTo, nameLinkId(opened.row.id)]);
  };

  const caption = captionOf(shelter.displayName, counts);
  const captionSplit = caption.lastIndexOf(" · ") + 3;
  const captionHead = caption.slice(0, captionSplit);
  const captionTail = caption.slice(captionSplit);
  const closeLabel = uk.kabinet.profileEdit.pause.close;

  const stale = filter.kind === "stale";
  const staleButton = stale ? (
    <Button variant="secondary" onClick={() => void loadFirst({ kind: "all" })}>
      {t.stale.showAll}
    </Button>
  ) : (
    <Button
      variant="ghost"
      aria-describedby="animal-list-stale"
      onClick={() => void loadFirst({ kind: "stale" })}
    >
      {t.filter.label}
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level={1} look="display-l" id="animal-list-title">
            {t.title}
          </Heading>
          {/* «N карток ?» never splits; the shelter's name may wrap before it. */}
          <div className="flex flex-wrap items-center gap-x-1 text-body text-ink-2">
            <span>{captionHead}</span>
            <span className="inline-flex items-center whitespace-nowrap">
              {captionTail}
              <InfoTip label={t.orderInfoLabel} closeLabel={closeLabel}>
                {t.orderNote}
              </InfoTip>
            </span>
          </div>
        </div>
        {editable ? (
          <LinkButton href={NEW_ANIMAL_PATH} prefetch={false} aria-label={t.add}>
            <span className="tablet:hidden">{t.addShort}</span>
            <span className="hidden tablet:inline">{t.add}</span>
          </LinkButton>
        ) : null}
      </header>

      {attention}

      {/* One sticky live region per kind, always in the DOM so a change is announced; empty ones are hidden. */}
      <div className="sticky top-3 z-(--z-header) flex flex-col gap-2">
        <p
          role="status"
          className="rounded-field border-2 border-line bg-surface px-4 py-3 text-label text-ink shadow-float empty:hidden"
        >
          {notice?.kind === "status" ? notice.text : null}
        </p>
        <p
          role="alert"
          className="rounded-field border-2 border-danger bg-surface px-4 py-3 text-label text-ink shadow-float empty:hidden"
        >
          {notice?.kind === "alert" ? notice.text : null}
        </p>
      </div>

      {visibilityNotice.kind === "paused" ? (
        <Panel
          as="section"
          tone="outline"
          padding="lg"
          aria-labelledby="animal-list-paused"
          className="flex flex-col items-start gap-3"
        >
          <Text look="label" id="animal-list-paused">
            {visibilityNotice.line}
          </Text>
          <Text look="body">{t.paused.hidden}</Text>
          {editable ? (
            <Button
              variant="secondary"
              aria-busy={resuming || undefined}
              onClick={() => void resume()}
            >
              {uk.kabinet.profileEdit.pause.resumeButton}
            </Button>
          ) : null}
        </Panel>
      ) : visibilityNotice.kind === "line" ? (
        <Panel tone="outline" padding="md">
          <Text look="label">{visibilityNotice.text}</Text>
        </Panel>
      ) : null}

      {total === 0 && !stale ? (
        <EmptyState
          inset="none"
          title={t.empty.title}
          {...(shown ? { body: t.empty.body } : {})}
          action={
            editable ? (
              <>
                <LinkButton href={NEW_ANIMAL_PATH} prefetch={false}>
                  {t.empty.add}
                </LinkButton>
                <Text look="hint">{t.empty.caption}</Text>
              </>
            ) : undefined
          }
        />
      ) : (
        <>
          {staleCount > 0 || stale ? (
            // The strip is a region named by its own sentence while there is
            // anything stale; with nothing left to count, only the way back
            // to every card remains, and a region would have no name to give.
            staleCount > 0 ? (
              <Panel
                as="section"
                tone="sunken"
                padding="md"
                aria-labelledby="animal-list-stale"
                className="flex flex-col items-start gap-1"
              >
                <div className="flex flex-wrap items-center gap-x-2">
                  <Text look="label" id="animal-list-stale">
                    {staleLineOf(staleCount)}
                  </Text>
                  <span aria-hidden="true" className="text-label text-ink-2">
                    ·
                  </span>
                  {staleButton}
                </div>
                {shown ? <Text look="hint">{t.stale.caption}</Text> : null}
              </Panel>
            ) : (
              <div className="flex">{staleButton}</div>
            )
          ) : null}

          <FilterTabs
            label={t.filter.label}
            idPrefix="animal-list"
            panelId="animal-list-panel"
            value={stale ? "stale" : filter.kind === "listing" ? filter.listing : "all"}
            tabs={filterChipsOf(counts).map((chip) => ({
              id: chip.id,
              label: chip.text,
              count: chip.count,
              accessibleName: chip.label,
            }))}
            onChange={(id) => {
              const chip = filterChipsOf(counts).find((candidate) => candidate.id === id);
              if (
                chip !== undefined &&
                (!sameFilter(chip.filter, filter) || load.kind === "failed")
              ) {
                void loadFirst(chip.filter);
              }
            }}
          />

          <section
            id="animal-list-panel"
            role="tabpanel"
            aria-labelledby={
              stale
                ? "animal-list-title"
                : filterTabId("animal-list", filter.kind === "listing" ? filter.listing : "all")
            }
            aria-busy={load.kind === "loading" || undefined}
            className="flex flex-col gap-3"
          >
            {load.kind === "loading" ? (
              <Text look="hint">{t.loading}</Text>
            ) : load.kind === "failed" ? (
              <div className="flex flex-col items-start gap-3">
                <InlineStatus tone="error">{t.loadFailed}</InlineStatus>
                <Button variant="secondary" onClick={() => void loadFirst(filter)}>
                  {uk.kabinet.profileEdit.state.retry}
                </Button>
              </div>
            ) : items.length === 0 ? (
              <Text look="body">{t.filterEmpty}</Text>
            ) : (
              <ul className="grid grid-cols-cards gap-gutter">
                {items.map((row) => (
                  <AnimalManageCard
                    key={row.id}
                    card={toAnimalManageCard(row, now)}
                    editable={editable}
                    busy={busy.has(row.id)}
                    openMenu={openMenu?.id === row.id ? openMenu.menu : null}
                    onOpenMenu={(menu) => setOpenMenu(menu === null ? null : { id: row.id, menu })}
                    onMove={(item) => onMove(row, item)}
                    onPublish={() => {
                      if (editable)
                        void runMove(row, "publish", { type: "publish" }).then(alertOrNull);
                    }}
                    onConfirm={() => void confirm(row)}
                    onDelete={() => {
                      if (editable)
                        setDialog({ kind: "delete", row, returnTo: moreTriggerId(row.id) });
                    }}
                    onCopyLink={(href) => void copyLink(href)}
                  />
                ))}
              </ul>
            )}
          </section>

          {load.kind === "idle" && cursor !== null ? (
            <div className="flex flex-col items-start gap-2">
              {more.kind === "failed" ? (
                <InlineStatus tone="error">{t.loadFailed}</InlineStatus>
              ) : null}
              <Button
                variant="secondary"
                aria-busy={more.kind === "loading" || undefined}
                onClick={() => void loadMore()}
              >
                {more.kind === "failed" ? uk.kabinet.profileEdit.state.retry : t.loadMore}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {dialog?.kind === "adopt" ? (
        <AdoptDialog
          name={dialog.row.name}
          onConfirm={async () => {
            const refusal = await runMove(dialog.row, "adopt", { type: "adopt" });
            if (refusal === null) closeDialog();
            return refusal;
          }}
          onClose={closeDialog}
        />
      ) : dialog?.kind === "withdraw" ? (
        <WithdrawDialog
          name={dialog.row.name}
          onConfirm={async (reason) => {
            const refusal = await runMove(dialog.row, "withdraw", { type: "withdraw", reason });
            if (refusal === null) closeDialog();
            return refusal;
          }}
          onClose={closeDialog}
        />
      ) : dialog?.kind === "delete" ? (
        <DeleteDialog
          name={dialog.row.name}
          hasPhotos={dialog.row.coverPhoto !== null}
          onConfirm={async () => {
            const refusal = await deleteDraft(dialog.row);
            if (refusal === null) closeDialog();
            return refusal;
          }}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}
