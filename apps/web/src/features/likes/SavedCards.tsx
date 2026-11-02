"use client";

import type { AnimalId } from "@opika/domain";
import { DEFAULT_GALLERY_SORT, NO_FILTERS } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LinkButton } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Icon } from "../../ui/Icon";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";
import { ToastProvider, useToast } from "../../ui/Toast";
import { Tooltip } from "../../ui/Tooltip";
import { cardCityId } from "../gallery/card-text";
import type { CitySlugsById } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import type { RemovedSave } from "./likes-store";
import { type SavedCardResult, useSavedCards } from "./useSavedCards";

interface SavedCardsProps {
  /** The server-rendered title and note; the island adds its own storage warning beside them. */
  intro: ReactNode;
}

/** An `unavailable` item with no name has nothing honest to show (S8-D2) - dropped, not rendered. */
type VisibleSavedCardResult =
  | Extract<SavedCardResult, { kind: "available" }>
  | (Extract<SavedCardResult, { kind: "unavailable" }> & { name: string });

function hasSomethingToShow(item: SavedCardResult): item is VisibleSavedCardResult {
  return item.kind !== "unavailable" || item.name !== null;
}

/**
 * `GalleryCard`'s own href needs a `FeedFilters` and a city-slug map the
 * same way the gallery does, but the saved page is a fixed list of ids, not
 * a filtered or sorted one - the same "provably never consulted" pair
 * `ShelterPageScreen.tsx`'s own `EMPTY_CITY_SLUGS` comment explains for the
 * identical reason: `NO_FILTERS.cities` is always `{ kind: "any" }`.
 */
const EMPTY_CITY_SLUGS: CitySlugsById = new Map();

/** How long a removed card takes to collapse; the CSS (`saved-item`) uses the same 200 ms. */
const COLLAPSE_MS = 200;
/** The undo stays on screen this long. */
const UNDO_MS = 6000;
/** `pendingFocus` value for the empty state's text (a card id never looks like this). */
const EMPTY_FOCUS = "empty";

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Leaving = { item: VisibleSavedCardResult; index: number };

const nameOf = (item: VisibleSavedCardResult): string =>
  item.kind === "available" ? item.card.name : item.name;

/** One grid for loading and loaded, so a skeleton swapping for its card moves nothing. */
const GRID = "grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4 desktop:gap-7.5";

/**
 * The saved list (`/zberezheni`). The ids live in `localStorage`, which a server render cannot read,
 * so everything that depends on them is this island; the page around it is server-rendered.
 *
 * `unknown` (before storage has been read) renders the empty state, not nothing: that panel is
 * already in the server HTML, so a fresh visitor sees no shift and no wait for hydration (measured
 * 2.8-3.2 s LCP / 0.147 CLS before, responsive audit 2026-10-28). A returning visitor with saves
 * sees it briefly before the skeleton, a rarer and shorter flash, traded on purpose.
 * `loading` shows an aria-live notice and the real count of skeleton cards, never the empty state.
 *
 * Removing a card (the bookmark on its photo) writes the store at once, so the header count follows;
 * the card then collapses out and a toast offers «Повернути», which puts it back in the same place.
 */
export function SavedCards({ intro }: SavedCardsProps) {
  return (
    <ToastProvider dismissLabel={uk.preview.close} durationMs={UNDO_MS}>
      <SavedCardsBody intro={intro} />
    </ToastProvider>
  );
}

/**
 * The remove control: a bookmark, filled because the card is saved, in the photo's top-right corner.
 * 40px to the eye on a phone, with a 44px press area. A sibling of the card link, never inside it.
 */
function RemoveBookmark({ animalId, onRemove }: { animalId: string; onRemove: () => void }) {
  return (
    <Tooltip
      text={uk.likes.removeFromSaved}
      className="absolute top-1.5 right-1.5 tablet:top-2 tablet:right-2"
    >
      <button
        type="button"
        aria-label={uk.likes.removeFromSaved}
        onClick={onRemove}
        data-testid="saved-remove"
        data-saved-bookmark={animalId}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-pill focus-ring"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-pill bg-surface text-ink shadow-float tablet:size-11"
        >
          <Icon name="bookmark" size="md" className="fill-current" />
        </span>
      </button>
    </Tooltip>
  );
}

function SavedCardsBody({ intro }: SavedCardsProps) {
  // City names come with the cards (`animals.cardsByIds` carries a label per city), not from a list.
  const { load, cityNames, storageBlocked, removeSaved, restoreSaved } = useSavedCards();
  const { show } = useToast();
  // Cards already out of the store but still collapsing on screen, and where each one sat.
  const [leaving, setLeaving] = useState<readonly Leaving[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLUListElement | null>(null);
  const emptyRef = useRef<HTMLParagraphElement | null>(null);
  // Where focus goes once that element exists: a card's id, or `EMPTY_FOCUS`.
  const pendingFocus = useRef<string | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // S8-D2: an id that resolves to no animal and has no name has no honest sentence to show, so it
  // is dropped; the empty/grid decision uses this filtered list, not the raw result.
  const visible = load.kind === "ready" ? load.items.filter(hasSomethingToShow) : [];

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  // After every render: a target that is not there yet (the empty state waits out the collapse) is retried.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const element =
      target === EMPTY_FOCUS
        ? emptyRef.current
        : listRef.current?.querySelector<HTMLElement>(`[data-saved-bookmark="${target}"]`);
    if (!element) return;
    element.focus();
    pendingFocus.current = null;
  });

  const undo = (removed: RemovedSave, item: VisibleSavedCardResult) => {
    restoreSaved(removed);
    setLeaving((current) => current.filter((entry) => entry.item.animalId !== item.animalId));
    // The toast's button is gone once pressed: focus goes to the card that came back.
    pendingFocus.current = item.animalId;
    setAnnouncement(fillTemplate(uk.likes.added, { name: nameOf(item) }));
  };

  const remove = (item: VisibleSavedCardResult, at: number) => {
    const removed = removeSaved(item.animalId as AnimalId);
    if (removed === null) return;
    const neighbour = visible[at + 1] ?? visible[at - 1];
    pendingFocus.current = neighbour?.animalId ?? EMPTY_FOCUS;
    if (!prefersReducedMotion()) {
      setLeaving((current) => [...current, { item, index: at }]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setLeaving((current) => current.filter((entry) => entry.item.animalId !== item.animalId));
      }, COLLAPSE_MS);
      timers.current.add(timer);
    }
    setAnnouncement(fillTemplate(uk.likes.removed, { name: nameOf(item) }));
    show(uk.likes.removedToast, "info", {
      durationMs: UNDO_MS,
      action: { label: uk.likes.undo, onAction: () => undo(removed, item) },
    });
  };

  const rows: { item: VisibleSavedCardResult; leaving: boolean }[] = visible.map((item) => ({
    item,
    leaving: false,
  }));
  for (const entry of [...leaving].sort((a, b) => a.index - b.index)) {
    rows.splice(Math.min(entry.index, rows.length), 0, { item: entry.item, leaving: true });
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {intro}
        {storageBlocked && (
          <p className="text-caption text-ink-2" data-testid="saved-storage-blocked">
            {uk.likes.storageBlocked}
          </p>
        )}
      </div>

      {load.kind === "loading" && (
        <span role="status" aria-live="polite" className="sr-only">
          {uk.likes.loading}
        </span>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      {load.kind === "loading" && (
        <ul data-testid="saved-skeletons" aria-busy="true" className={GRID}>
          {Array.from({ length: load.count }, (_, index) => (
            <li key={index}>
              <Skeleton shape="block" className="aspect-328/480" />
            </li>
          ))}
        </ul>
      )}

      {load.kind !== "loading" && rows.length === 0 && (
        <Panel padding="lg" data-testid="saved-empty" className="flex flex-col items-start gap-4">
          <p ref={emptyRef} tabIndex={-1} className="text-body text-ink-2 text-pretty outline-none">
            {uk.likes.empty}
          </p>
          <LinkButton href="/tvaryny">{uk.likes.emptyLink}</LinkButton>
        </Panel>
      )}

      {rows.length > 0 && (
        <ul ref={listRef} className={GRID}>
          {rows.map(({ item, leaving: isLeaving }) => (
            <li
              key={item.animalId}
              inert={isLeaving}
              className={cx("saved-item", isLeaving && "saved-item-leaving")}
            >
              <div className={cx("relative min-h-0", isLeaving && "overflow-hidden")}>
                {item.kind === "available" ? (
                  <GalleryCard
                    card={item.card}
                    cityName={cityNames[cardCityId(item.card)] ?? null}
                    filters={NO_FILTERS}
                    sort={DEFAULT_GALLERY_SORT}
                    citySlugs={EMPTY_CITY_SLUGS}
                    cornerControl
                  />
                ) : (
                  <div data-testid="saved-unavailable">
                    <Panel className="pr-14 text-body text-ink-2">
                      {fillTemplate(uk.likes.unavailable, { name: item.name })}
                    </Panel>
                  </div>
                )}
                <RemoveBookmark
                  animalId={item.animalId}
                  onRemove={() => remove(item, visible.indexOf(item))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
