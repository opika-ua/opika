"use client";

import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { Footer } from "../chrome/Footer";
import { SiteHeader } from "../chrome/SiteHeader";
import { buttonClass } from "../controls/controls";
import { AnimalCard } from "../gallery/AnimalCard";
import { SavedCardSkeleton } from "./SavedCardSkeleton";
import { type SavedCardResult, useSavedCards } from "./useSavedCards";

interface SavedPageScreenProps {
  /** `cities.list`, resolved server-side — this screen never fetches it itself. */
  cityNames: Readonly<Record<string, string>>;
  /** Designer feedback batch D: whether to show the role-aware header's kabinet nav. Defaulted, like `AnimalDetailScreen`'s — the real caller (`app/zberezheni/page.tsx`) always passes it explicitly. */
  kabinetSignedIn?: boolean;
}

/** An `unavailable` item with no name has nothing honest to show (S8-D2) — dropped, not rendered. */
type VisibleSavedCardResult =
  | Extract<SavedCardResult, { kind: "available" }>
  | (Extract<SavedCardResult, { kind: "unavailable" }> & { name: string });

function hasSomethingToShow(item: SavedCardResult): item is VisibleSavedCardResult {
  return item.kind !== "unavailable" || item.name !== null;
}

function EmptyState() {
  return (
    <div
      data-testid="saved-empty"
      className="bg-rg-surface rounded-rg-card py-12 px-8 flex flex-col items-start gap-4"
    >
      <p className="text-[17px]/[26px] text-rg-ink-2 text-pretty">{uk.likes.empty}</p>
      <Link href="/tvaryny" className={buttonClass("primary")}>
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
 * taken" in the PR — a plain list of gallery cards, his copy for every
 * state, nothing invented beyond arrangement.
 *
 * **Designer feedback batch C (2026-10-23):** `load`'s `unknown`/`loading`
 * states (`useSavedCards.ts`'s own comment has the race this replaced)
 * render an `aria-live` notice and, once the real count is known,
 * that many skeleton cards — never the empty state for a list that merely
 * hasn't loaded yet. The empty state now only ever renders for ids that are
 * genuinely empty (`load.kind === "empty"`) or for a `ready` list with
 * nothing left to show after the S8-D2 filter below.
 */
export function SavedPageScreen({ cityNames, kabinetSignedIn = false }: SavedPageScreenProps) {
  const { load, storageBlocked, removeSaved } = useSavedCards();
  // S8-D2: a saved id that resolves to no animal at all has no honest sentence to
  // show (inventing one isn't the builder's call, and `[COPY PENDING]` can never
  // ship live in this catalogue — Q-B, 2026-10-19 — since it turns production
  // sign-in off site-wide). Dropped from the page entirely rather than shown with
  // no text; the empty/grid decision below is based on this filtered list, not
  // the raw fetch result, so a page whose only saved id is one of these reads as
  // empty rather than as a grid with nothing visible in it. A type predicate, not
  // a plain filter, so `item.name` narrows to `string` in the unavailable branch.
  const visible = load.kind === "ready" ? load.items.filter(hasSomethingToShow) : null;

  return (
    <div className="font-rg min-h-dvh bg-rg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      <div className="p-4 tablet:p-6 desktop:px-8 desktop:max-w-[1200px] desktop:mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-bold text-[28px]/[34px] desktop:text-[34px]/[38px] tracking-[-0.03em] text-rg-ink">
            {uk.likes.title}
          </h1>
          <p className="text-[13px]/[18px] text-rg-ink-3">{uk.likes.deviceOnly}</p>
          {storageBlocked && (
            <p className="text-[13px]/[18px] text-rg-ink-3" data-testid="saved-storage-blocked">
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
            className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-4"
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
          <ul className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
            {visible.map((item) => (
              <li key={item.animalId} className="flex flex-col gap-2">
                {item.kind === "available" ? (
                  <AnimalCard
                    card={item.card}
                    cityName={cityNames[item.card.publicLocation?.cityId ?? ""] ?? null}
                  />
                ) : (
                  <div
                    data-testid="saved-unavailable"
                    className="bg-rg-fill rounded-rg-card p-4 text-[15px]/[22px] text-rg-ink-2"
                  >
                    {fillTemplate(uk.likes.unavailable, { name: item.name })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeSaved(item.animalId)}
                  data-testid="saved-remove"
                  className={`${buttonClass("secondary")} min-h-10 self-start`}
                >
                  {uk.likes.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 tablet:p-6 desktop:px-8 desktop:max-w-[1200px] desktop:mx-auto">
        <Footer />
      </div>
    </div>
  );
}
