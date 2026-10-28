"use client";

import { DEFAULT_GALLERY_SORT, NO_FILTERS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { Footer } from "../chrome/Footer";
import { SiteHeader } from "../chrome/SiteHeader";
import type { CitySlugsById } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import { SavedCardSkeleton } from "./SavedCardSkeleton";
import { type SavedCardResult, useSavedCards } from "./useSavedCards";

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]";

interface SavedPageScreenProps {
  /** `cities.list`, resolved server-side - this screen never fetches it itself. */
  cityNames: Readonly<Record<string, string>>;
  /** Designer feedback batch D: whether to show the role-aware header's kabinet nav. Defaulted, like `AnimalDetailScreen`'s - the real caller (`app/zberezheni/page.tsx`) always passes it explicitly. */
  kabinetSignedIn?: boolean;
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

function EmptyState() {
  return (
    <div
      data-testid="saved-empty"
      className="flex flex-col items-start gap-4 rounded-brand-panel bg-brand-surface px-8 py-12"
    >
      <p className="text-[16px]/[1.4] text-brand-ink-2 text-pretty">{uk.likes.empty}</p>
      <Link
        href="/tvaryny"
        className={`inline-flex min-h-13 items-center rounded-brand-pill bg-brand-ink px-6 text-[16px] font-semibold text-brand-on-ink ${FOCUS}`}
      >
        {uk.likes.emptyLink}
      </Link>
    </div>
  );
}

/**
 * S8, the saved page (`/zberezheni`). Client-rendered end to end: the list
 * of ids lives in `localStorage`, which does not exist on the server, so
 * there is nothing for a server render to do here beyond the shell in
 * `app/zberezheni/page.tsx` (metadata, and resolving `cityNames` once).
 *
 * No mock exists for this screen (`docs/designer-round-1.md` §4: "No mock
 * frame"), so its layout is the builder's call, listed under "Decisions
 * taken" in the PR - the gallery's own card (`GalleryCard`) and grid
 * (`app/tvaryny/page.tsx`'s own wrapper/grid classes, reused verbatim so
 * `GalleryCard`'s hand-derived `sizes` attribute stays valid for the real
 * rendered width here), his copy for every state, nothing invented beyond
 * arrangement.
 *
 * **Designer feedback batch C (2026-10-23):** `load`'s `unknown`/`loading`
 * states (`useSavedCards.ts`'s own comment has the race this replaced)
 * render an `aria-live` notice and, once the real count is known,
 * that many skeleton cards - never the empty state for a list that merely
 * hasn't loaded yet. The empty state now only ever renders for ids that are
 * genuinely empty (`load.kind === "empty"`) or for a `ready` list with
 * nothing left to show after the S8-D2 filter below.
 */
export function SavedPageScreen({ cityNames, kabinetSignedIn = false }: SavedPageScreenProps) {
  const { load, storageBlocked, removeSaved } = useSavedCards();
  // S8-D2: a saved id that resolves to no animal at all has no honest sentence to
  // show (inventing one isn't the builder's call, and `[COPY PENDING]` can never
  // ship live in this catalogue - Q-B, 2026-10-19 - since it turns production
  // sign-in off site-wide). Dropped from the page entirely rather than shown with
  // no text; the empty/grid decision below is based on this filtered list, not
  // the raw fetch result, so a page whose only saved id is one of these reads as
  // empty rather than as a grid with nothing visible in it. A type predicate, not
  // a plain filter, so `item.name` narrows to `string` in the unavailable branch.
  const visible = load.kind === "ready" ? load.items.filter(hasSomethingToShow) : null;

  return (
    <div className="font-brand-ui min-h-dvh bg-brand-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-13 px-4 pt-10 pb-10 tablet:px-6 desktop:px-14 desktop:pb-14">
        <div className="flex flex-col gap-1">
          <h1 className="font-brand-display text-[48px] leading-none text-brand-ink">
            {uk.likes.title}
          </h1>
          <p className="text-[15px]/[20px] text-brand-ink-2">{uk.likes.deviceOnly}</p>
          {storageBlocked && (
            <p className="text-[15px]/[20px] text-brand-ink-2" data-testid="saved-storage-blocked">
              {uk.likes.storageBlocked}
            </p>
          )}
        </div>

        {(load.kind === "unknown" || load.kind === "loading") && (
          <span role="status" aria-live="polite" className="sr-only">
            {uk.likes.loading}
          </span>
        )}

        {load.kind === "loading" && (
          <ul
            data-testid="saved-skeletons"
            className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-4 desktop:gap-[30px]"
          >
            {Array.from({ length: load.count }, (_, index) => (
              <li key={index}>
                <SavedCardSkeleton />
              </li>
            ))}
          </ul>
        )}

        {(load.kind === "empty" || (visible !== null && visible.length === 0)) && <EmptyState />}

        {visible !== null && visible.length > 0 && (
          <ul className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-4 desktop:gap-[30px]">
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
                  <div
                    data-testid="saved-unavailable"
                    className="rounded-brand-panel bg-brand-surface p-4 text-[16px]/[1.4] text-brand-ink-2"
                  >
                    {fillTemplate(uk.likes.unavailable, { name: item.name })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeSaved(item.animalId)}
                  data-testid="saved-remove"
                  className={`inline-flex min-h-11 w-fit items-center rounded-brand-field border-2 border-brand-line px-4 text-[15px] font-medium text-brand-ink hover:bg-brand-line ${FOCUS}`}
                >
                  {uk.likes.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pb-10 tablet:px-6 desktop:px-14">
        <Footer />
      </div>
    </div>
  );
}
