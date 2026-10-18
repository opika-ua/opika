"use client";

import type { KabinetAnimalListFilter, KabinetCursor, KabinetShelterView } from "@opika/contracts";
import { fillTemplate, uk } from "@opika/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type KabinetAnimalListClient,
  kabinetAnimalListBrowserClient,
} from "../../../api/kabinet-browser-client";
import { Button, buttonClass } from "../../controls/controls";
import type { AnimalFormEditing } from "../animal-form/AnimalForm";
import { missingSentence } from "../animal-form/labels";
import { shelterVisibilityOf } from "../animal-page";
import { BODY, CAPTION, CARD, ERROR_TEXT, PAGE_TITLE, STRONG } from "../profile-edit/styles";
import { NEW_ANIMAL_PATH } from "../routes";
import { AnimalListRow, moreButtonId } from "./AnimalListRow";
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
  movedAnnouncementOf,
  type RowAction,
  rowAfterMove,
  sameFilter,
  staleLineOf,
  totalOf,
  visibilityNoticeOf,
} from "./list-model";

/**
 * K2 · the shelter's animal list (KABINET K2; `docs/k2-copy-sheet.md`), thin
 * and unstyled until the brand lands: every behaviour, the shared controls
 * and tokens, no layout work.
 *
 * - **Filters** (N3): one chip per listing kind with its inventory count, or
 *   the stale cards (N5's «Показати ці N»), always the server's own filter
 *   (`shelter.animals.list`), never the loaded page filtered here, so a stale
 *   card on a later page is found too (P7).
 * - **Moves**: the forward action and «Ще» (sheet §4). «Уже вдома» and
 *   «Зняти з показу» confirm in N15's dialog; the others act on one tap. A
 *   move answers the animal, and its row changes in place (no move touches
 *   `lastUpdatedAt`, so none reorders the list, HS-T9); the counts and the
 *   strip are then read again.
 * - **«Ще шукає» / «Ще домовляються»** (N4): one animal per tap, never all
 *   (commitment #7). For 8 seconds the cell reads «Підтверджено сьогодні» with
 *   «Скасувати · N с»; the server takes the undo for 13 (its slack), so a tap
 *   in the last second still lands, and refuses it after any newer write
 *   (`UNDO_EXPIRED`, RH-B7's photo change included).
 * - **A lost answer** (no response at all): the server may have done it, so
 *   the row is read again before anything is said (K4-T16's pattern).
 * - **Who can act**: `editing` is the page's `decideAccess` answer with the
 *   served policy, so the buttons work exactly where the API accepts them; a
 *   support view sees them disabled (S5).
 * - **Nothing here varies with adopters** (commitment #2): the rows, counts
 *   and refusals are inventory and the shelter's own actions only.
 */

const t = uk.kabinet.animalList;
const UNDO_SHOWN_MS = 8_000;

type Move = Exclude<RowAction, "deleteDraft" | "edit">;
type Load = { kind: "idle" } | { kind: "loading" } | { kind: "failed" };
type Notice = { kind: "status" | "alert"; text: string } | null;
type Dialog =
  | { kind: "adopt"; row: AnimalRow }
  | { kind: "withdraw"; row: AnimalRow }
  | { kind: "delete"; row: AnimalRow }
  | null;

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
    case "not_available":
      return uk.kabinet.profileEdit.errors.notAvailable;
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

export function AnimalList({
  shelter,
  first,
  viewer,
  editing,
  client = kabinetAnimalListBrowserClient,
  clock = () => new Date(),
}: {
  shelter: KabinetShelterView;
  first: AnimalListPageData;
  viewer: "admin" | "support";
  editing: AnimalFormEditing;
  client?: KabinetAnimalListClient;
  clock?: () => Date;
}) {
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
  /** Animal id → when its «Підтверджено сьогодні» and undo stop showing (client clock, ms). */
  const [undoable, setUndoable] = useState<Readonly<Record<string, number>>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [resuming, setResuming] = useState(false);
  const [, setTick] = useState(0);
  const loadRequest = useRef(0);

  const now = clock();
  const visibility = shelterVisibilityOf(verification.status);
  const shown = visibility === "visible";
  const visibilityNotice = visibilityNoticeOf(verification);
  const total = totalOf(counts);

  // The undo countdown: one timer while any confirmation is on screen.
  const pending = Object.keys(undoable).length > 0;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      const at = clock().getTime();
      setUndoable((current) => {
        const kept = Object.entries(current).filter(([, until]) => until > at);
        return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
      });
      setTick((tick) => tick + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [pending, clock]);

  const setRowBusy = (animalId: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(animalId);
      else next.delete(animalId);
      return next;
    });

  const replaceRow = (view: Parameters<typeof rowAfterMove>[1]) =>
    setItems((rows) =>
      rows.map((row) => (row.id === view.id ? rowAfterMove(row, view, clock()) : row)),
    );

  const forgetUndo = (animalId: string) =>
    setUndoable((current) => {
      if (!(animalId in current)) return current;
      const { [animalId]: _gone, ...rest } = current;
      return rest;
    });

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

  const loadFirst = async (next: KabinetAnimalListFilter) => {
    const request = ++loadRequest.current;
    setFilter(next);
    setOpenMenu(null);
    setLoad({ kind: "loading" });
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
    setMore({ kind: "loading" });
    try {
      const page = await client.shelter.animals.list({ filter, cursor, limit: ANIMAL_LIST_PAGE });
      setItems((rows) => [...rows, ...page.items]);
      setCursor(page.nextCursor);
      setCounts(page.counts);
      setStaleCount(page.staleCount);
      setMore({ kind: "idle" });
    } catch (error) {
      // A cursor the server no longer accepts can't be retried into working: start over.
      if ((error as { code?: unknown } | null)?.code === "INVALID_CURSOR") {
        await loadFirst(filter);
        return;
      }
      setMore({ kind: "failed" });
    }
  };

  /** The row as stored, after a call whose answer never arrived; null if that read failed too. */
  const reread = async (animalId: string) => {
    try {
      return await client.shelter.animals.byId({ animalId: animalId as AnimalRow["id"] });
    } catch {
      return null;
    }
  };

  const runMove = async (
    row: AnimalRow,
    move: Move,
    event: Parameters<KabinetAnimalListClient["shelter"]["animals"]["transition"]>[0]["event"],
  ): Promise<DialogResult> => {
    setRowBusy(row.id, true);
    setNotice(null);
    try {
      const view = await client.shelter.animals.transition({ animalId: row.id, event });
      replaceRow(view);
      forgetUndo(row.id);
      setNotice({ kind: "status", text: movedAnnouncementOf(move, row.name, visibility) });
      void refreshCounts();
      return null;
    } catch (error) {
      const failure = actionFailureOf(error);
      if (failure.kind === "no_answer") {
        const stored = await reread(row.id);
        if (stored !== null) replaceRow(stored);
        if (stored?.listing.kind === listingAfter[move]) {
          setNotice({ kind: "status", text: movedAnnouncementOf(move, row.name, visibility) });
          void refreshCounts();
          return null;
        }
      }
      return refusalOf(failure, t.errors.actionFailed);
    } finally {
      setRowBusy(row.id, false);
    }
  };

  const alertOrNull = (refusal: DialogResult) => {
    if (refusal !== null) setNotice({ kind: "alert", text: refusal });
  };

  const onAction = (row: AnimalRow, action: Exclude<RowAction, "edit">) => {
    if (!editable) return;
    switch (action) {
      case "adopt":
        setDialog({ kind: "adopt", row });
        return;
      case "withdraw":
        setDialog({ kind: "withdraw", row });
        return;
      case "deleteDraft":
        setDialog({ kind: "delete", row });
        return;
      case "publish":
        void runMove(row, "publish", { type: "publish" }).then(alertOrNull);
        return;
      case "reserve":
        void runMove(row, "reserve", { type: "reserve" }).then(alertOrNull);
        return;
      case "release":
        void runMove(row, "release", { type: "release" }).then(alertOrNull);
        return;
      case "restore":
        void runMove(row, "restore", { type: "restore_to_draft" }).then(alertOrNull);
        return;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled action; unreachable at runtime */
      default: {
        const unreachable: never = action;
        return unreachable;
      }
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
      if (failure.kind === "no_answer") {
        try {
          const stored = await client.shelter.animals.byId({ animalId: row.id });
          replaceRow(stored);
        } catch (reread) {
          if (actionFailureOf(reread).kind === "not_found") return deleted();
        }
      }
      return refusalOf(failure, t.errors.actionFailed);
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
      replaceRow(animal);
      setUndoable((current) => ({ ...current, [row.id]: clock().getTime() + UNDO_SHOWN_MS }));
      setNotice({ kind: "status", text: t.confirm.done });
      void refreshCounts();
    } catch (error) {
      const failure = actionFailureOf(error);
      if (failure.kind === "no_answer") {
        const stored = await reread(row.id);
        if (stored !== null) replaceRow(stored);
        const before = confirmedAtOf(row.listing)?.getTime();
        const after = stored === null ? undefined : confirmedAtOf(stored.listing)?.getTime();
        // It went through: the date moved. The undo's window isn't known, so none is offered.
        if (after !== undefined && after !== before) {
          setNotice({ kind: "status", text: t.confirm.done });
          void refreshCounts();
          return;
        }
      }
      setNotice({ kind: "alert", text: refusalOf(failure, t.confirm.failed) });
    } finally {
      setRowBusy(row.id, false);
    }
  };

  const undo = async (row: AnimalRow) => {
    if (!editable) return;
    setRowBusy(row.id, true);
    setNotice(null);
    try {
      const view = await client.shelter.animals.undoConfirm({ animalId: row.id });
      replaceRow(view);
      forgetUndo(row.id);
      setNotice({ kind: "status", text: t.confirm.undone });
      void refreshCounts();
    } catch (error) {
      const failure = actionFailureOf(error);
      if (failure.kind === "no_answer") {
        const stored = await reread(row.id);
        if (stored !== null) replaceRow(stored);
        const shownAt = confirmedAtOf(row.listing)?.getTime();
        const storedAt = stored === null ? undefined : confirmedAtOf(stored.listing)?.getTime();
        if (shownAt !== undefined && storedAt !== undefined && storedAt < shownAt) {
          forgetUndo(row.id);
          setNotice({ kind: "status", text: t.confirm.undone });
          void refreshCounts();
          return;
        }
      } else if (failure.kind === "undo_expired" || failure.kind === "illegal_transition") {
        forgetUndo(row.id);
      }
      setNotice({ kind: "alert", text: refusalOf(failure, t.errors.actionFailed) });
    } finally {
      setRowBusy(row.id, false);
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
            : failure.kind === "not_available"
              ? uk.kabinet.profileEdit.errors.notAvailable
              : uk.kabinet.profileEdit.state.failed,
      });
    } finally {
      setResuming(false);
    }
  };

  const closeDialog = () => {
    const animalId = dialog?.row.id;
    setDialog(null);
    // Focus back where the dialog was opened from, or to the heading if that row is gone.
    requestAnimationFrame(() => {
      const target =
        (animalId !== undefined ? document.getElementById(moreButtonId(animalId)) : null) ??
        document.getElementById("animal-list-title");
      target?.focus();
    });
  };

  const undoSecondsOf = (animalId: string): number | null => {
    const until = undoable[animalId];
    if (until === undefined) return null;
    const seconds = Math.ceil((until - now.getTime()) / 1_000);
    return seconds > 0 ? seconds : null;
  };

  const stale = filter.kind === "stale";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 id="animal-list-title" tabIndex={-1} className={PAGE_TITLE}>
            {t.title}
          </h1>
          <p className={BODY}>{captionOf(shelter.displayName, counts)}</p>
        </div>
        {editable ? (
          <a href={NEW_ANIMAL_PATH} aria-label={t.add} className={buttonClass("primary")}>
            <span className="tablet:hidden">{t.addShort}</span>
            <span className="hidden tablet:inline">{t.add}</span>
          </a>
        ) : null}
      </header>

      {visibilityNotice.kind === "paused" ? (
        <section aria-label={uk.kabinet.profileStatus.paused} className={`${CARD} items-start`}>
          <p className={STRONG}>{visibilityNotice.line}</p>
          <p className={BODY}>{t.paused.hidden}</p>
          {editable ? (
            <Button
              variant="secondary"
              aria-busy={resuming || undefined}
              onClick={() => void resume()}
            >
              {uk.kabinet.profileEdit.pause.resumeButton}
            </Button>
          ) : null}
        </section>
      ) : visibilityNotice.kind === "line" ? (
        <p className={STRONG}>{visibilityNotice.text}</p>
      ) : null}

      {total === 0 && !stale ? (
        <section aria-labelledby="animal-list-empty" className={`${CARD} items-start`}>
          <h2 id="animal-list-empty" className="text-xl font-bold tracking-tight text-rg-ink">
            {t.empty.title}
          </h2>
          {shown ? <p className={BODY}>{t.empty.body}</p> : null}
          {editable ? (
            <>
              <a href={NEW_ANIMAL_PATH} className={buttonClass("primary")}>
                {t.empty.add}
              </a>
              <p className={CAPTION}>{t.empty.caption}</p>
            </>
          ) : null}
        </section>
      ) : (
        <>
          {staleCount > 0 || stale ? (
            <section aria-label={t.stale.showAll} className={`${CARD} items-start`}>
              {staleCount > 0 ? <p className={STRONG}>{staleLineOf(staleCount)}</p> : null}
              {staleCount > 0 && shown ? <p className={CAPTION}>{t.stale.caption}</p> : null}
              {stale ? (
                <Button variant="secondary" onClick={() => void loadFirst({ kind: "all" })}>
                  {t.stale.showAll}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void loadFirst({ kind: "stale" })}>
                  {fillTemplate(t.stale.show, { count: String(staleCount) })}
                </Button>
              )}
            </section>
          ) : null}

          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className={`${CAPTION} mb-2`}>{t.filter.label}</legend>
            {filterChipsOf(counts).map((chip) => (
              <Button
                key={chip.filter.kind === "listing" ? chip.filter.listing : chip.filter.kind}
                variant="chip"
                aria-pressed={sameFilter(chip.filter, filter)}
                onClick={() => {
                  if (!sameFilter(chip.filter, filter) || load.kind === "failed") {
                    void loadFirst(chip.filter);
                  }
                }}
              >
                {chip.label}
              </Button>
            ))}
          </fieldset>

          <section
            aria-labelledby="animal-list-title"
            aria-busy={load.kind === "loading" || undefined}
            className="flex flex-col gap-3"
          >
            {load.kind === "loading" ? (
              <p className={CAPTION}>{t.loading}</p>
            ) : load.kind === "failed" ? (
              <div role="alert" className="flex flex-col items-start gap-2">
                <p className={ERROR_TEXT}>{t.loadFailed}</p>
                <Button variant="secondary" onClick={() => void loadFirst(filter)}>
                  {uk.kabinet.profileEdit.state.retry}
                </Button>
              </div>
            ) : items.length === 0 ? (
              <p className={BODY}>{t.filterEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((row) => (
                  <AnimalListRow
                    key={row.id}
                    row={row}
                    now={now}
                    editable={editable}
                    busy={busy.has(row.id)}
                    undoSeconds={undoSecondsOf(row.id)}
                    menuOpen={openMenu === row.id}
                    onToggleMenu={(open) => setOpenMenu(open ? row.id : null)}
                    onAction={(action) => onAction(row, action)}
                    onConfirm={() => void confirm(row)}
                    onUndo={() => void undo(row)}
                  />
                ))}
              </ul>
            )}
          </section>

          {load.kind === "idle" && cursor !== null ? (
            <div className="flex flex-col items-start gap-2">
              {more.kind === "failed" ? (
                <p role="alert" className={ERROR_TEXT}>
                  {t.loadFailed}
                </p>
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

      <p className={CAPTION}>{t.orderNote}</p>

      <p role="status" className={BODY}>
        {notice?.kind === "status" ? notice.text : null}
      </p>
      <p role="alert" className={ERROR_TEXT}>
        {notice?.kind === "alert" ? notice.text : null}
      </p>

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
