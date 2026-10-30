"use client";

import type { KabinetAnimalListFilter, KabinetCursor, KabinetShelterView } from "@opika/contracts";
import { UNDO_SHOWN_MS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  type KabinetAnimalListClient,
  kabinetAnimalListBrowserClient,
} from "../../../api/kabinet-browser-client";
import { Button, LinkButton } from "../../../ui/Button";
import { FilterTabs, filterTabId } from "../../../ui/FilterTabs";
import { EmptyState, InlineStatus } from "../../../ui/feedback";
import { Heading } from "../../../ui/Heading";
import { InfoToggle } from "../../../ui/InfoToggle";
import { Panel } from "../../../ui/Panel";
import { Text } from "../../../ui/Text";
import type { AnimalFormEditing } from "../animal-form/AnimalForm";
import { missingSentence, shelterVisibilityOf } from "../animal-form/labels";
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

type Move = Exclude<RowAction, "deleteDraft" | "edit">;
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
  attention = null,
}: {
  shelter: KabinetShelterView;
  first: AnimalListPageData;
  viewer: "admin" | "support";
  editing: AnimalFormEditing;
  client?: KabinetAnimalListClient;
  clock?: () => Date;
  /** Server-rendered notices that govern everything below (rejected, suspended, pending), shown under the title. */
  attention?: ReactNode;
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
      replaceRow(view);
      return { kind: "found", view };
    } catch (error) {
      return actionFailureOf(error).kind === "not_found" ? { kind: "gone" } : { kind: "unknown" };
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
      if (failure.kind !== "no_answer") return refusalOf(failure, t.errors.actionFailed);
      const stored = await reread(row.id);
      if (stored.kind === "unknown") return CARD_DIDNT_LOAD;
      if (stored.kind === "gone") return NOT_FOUND;
      // Read back where it was: it didn't move, which «Не вдалося» says.
      if (stored.view.listing.kind !== listingAfter[move]) return t.errors.actionFailed;
      setNotice({ kind: "status", text: movedAnnouncementOf(move, row.name, visibility) });
      void refreshCounts();
      return null;
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
      replaceRow(animal);
      setUndoable((current) => ({ ...current, [row.id]: clock().getTime() + UNDO_SHOWN_MS }));
      setNotice({ kind: "status", text: t.confirm.done });
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
        setNotice({ kind: "status", text: t.confirm.done });
        void refreshCounts();
        return;
      }
      // Read back unchanged: «…дата на картці не змінилася» is what the read showed.
      setNotice({ kind: "alert", text: t.confirm.failed });
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
      // An expired undo may be this undo's own earlier attempt, landed with
      // its answer lost: the card is read before anything is said about its date.
      if (failure.kind !== "no_answer" && failure.kind !== "undo_expired") {
        if (failure.kind === "illegal_transition") forgetUndo(row.id);
        setNotice({ kind: "alert", text: refusalOf(failure, t.errors.actionFailed) });
        return;
      }
      if (failure.kind === "undo_expired") forgetUndo(row.id);
      const stored = await reread(row.id);
      if (stored.kind !== "found") {
        if (stored.kind === "gone") forgetUndo(row.id);
        setNotice({ kind: "alert", text: stored.kind === "gone" ? NOT_FOUND : CARD_DIDNT_LOAD });
        return;
      }
      const shownAt = confirmedAtOf(row.listing)?.getTime();
      const storedAt = confirmedAtOf(stored.view.listing)?.getTime();
      if (shownAt !== undefined && storedAt !== undefined && storedAt < shownAt) {
        forgetUndo(row.id);
        setNotice({ kind: "status", text: t.confirm.undone });
        void refreshCounts();
        return;
      }
      // Read back with today's date: an expired undo says so; a lost one simply didn't happen.
      setNotice({
        kind: "alert",
        text: failure.kind === "undo_expired" ? t.confirm.undoExpired : t.errors.actionFailed,
      });
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
  const staleButton = stale ? (
    <Button variant="secondary" onClick={() => void loadFirst({ kind: "all" })}>
      {t.stale.showAll}
    </Button>
  ) : (
    <Button variant="secondary" onClick={() => void loadFirst({ kind: "stale" })}>
      {fillTemplate(t.stale.show, { count: String(staleCount) })}
    </Button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level={1} look="display-l" id="animal-list-title">
            {t.title}
          </Heading>
          <div className="flex flex-wrap items-center gap-x-1">
            <Text look="body" className="text-ink-2">
              {captionOf(shelter.displayName, counts)}
            </Text>
            <InfoToggle label={t.orderInfoLabel}>{t.orderNote}</InfoToggle>
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
                padding="lg"
                aria-labelledby="animal-list-stale"
                className="flex flex-col items-start gap-3"
              >
                <Text look="label" id="animal-list-stale">
                  {staleLineOf(staleCount)}
                </Text>
                {shown ? <Text look="hint">{t.stale.caption}</Text> : null}
                {staleButton}
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
