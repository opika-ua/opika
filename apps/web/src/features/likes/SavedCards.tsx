"use client";

import { DEFAULT_GALLERY_SORT, NO_FILTERS } from "@opika/domain";
import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import type { ReactNode } from "react";
import { Button, LinkButton } from "../../ui/Button";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";
import type { CitySlugsById } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import { type SavedCardResult, useSavedCards } from "./useSavedCards";

interface SavedCardsProps {
  /** `cities.list`, resolved server-side - this island never fetches it itself. */
  cityNames: Readonly<Record<string, string>>;
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
 */
export function SavedCards({ cityNames, intro }: SavedCardsProps) {
  const { load, storageBlocked, removeSaved } = useSavedCards();
  // S8-D2: an id that resolves to no animal and has no name has no honest sentence to show, so it
  // is dropped; the empty/grid decision uses this filtered list, not the raw result.
  const visible = load.kind === "ready" ? load.items.filter(hasSomethingToShow) : null;

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

      {load.kind === "loading" && (
        <ul data-testid="saved-skeletons" aria-busy="true" className={GRID}>
          {Array.from({ length: load.count }, (_, index) => (
            <li key={index}>
              <Skeleton shape="block" className="aspect-328/480" />
            </li>
          ))}
        </ul>
      )}

      {(load.kind === "unknown" ||
        load.kind === "empty" ||
        (visible !== null && visible.length === 0)) && (
        <Panel padding="lg" data-testid="saved-empty" className="flex flex-col items-start gap-4">
          <p className="text-body text-ink-2 text-pretty">{uk.likes.empty}</p>
          <LinkButton href="/tvaryny">{uk.likes.emptyLink}</LinkButton>
        </Panel>
      )}

      {visible !== null && visible.length > 0 && (
        <ul className={GRID}>
          {visible.map((item) => (
            <li key={item.animalId} className="flex flex-col gap-3">
              {item.kind === "available" ? (
                <GalleryCard
                  card={item.card}
                  cityName={cityNames[item.card.publicLocation?.cityId ?? ""] ?? null}
                  filters={NO_FILTERS}
                  sort={DEFAULT_GALLERY_SORT}
                  citySlugs={EMPTY_CITY_SLUGS}
                />
              ) : (
                <div data-testid="saved-unavailable">
                  <Panel className="text-body text-ink-2">
                    {fillTemplate(uk.likes.unavailable, { name: item.name })}
                  </Panel>
                </div>
              )}
              <Button
                variant="secondary"
                onClick={() => removeSaved(item.animalId)}
                data-testid="saved-remove"
                className="w-fit"
              >
                {uk.likes.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
