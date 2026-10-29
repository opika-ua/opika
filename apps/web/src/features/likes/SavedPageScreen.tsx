"use client";

import { DEFAULT_GALLERY_SORT, NO_FILTERS } from "@opika/domain";
import { fillTemplate, uk } from "@opika/i18n";
import { Button, LinkButton } from "../../ui/Button";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { Panel } from "../../ui/Panel";
import { Skeleton } from "../../ui/Skeleton";
import { SiteHeader } from "../chrome/SiteHeader";
import type { CitySlugsById } from "../gallery/filter-url";
import { GalleryCard } from "../gallery/GalleryCard";
import { type SavedCardResult, useSavedCards } from "./useSavedCards";

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

/** One grid for loading and loaded, so a skeleton swapping for its card moves nothing. */
const GRID = "grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4 desktop:gap-7.5";

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
 * **Designer feedback batch C (2026-10-23):** `load`'s `loading` state
 * (`useSavedCards.ts`'s own comment has the race this replaced) renders an
 * `aria-live` notice and, once the real count is known, that many skeleton
 * cards - never the empty state for a list that's actually mid-fetch. The
 * empty state renders for ids that are genuinely empty (`load.kind ===
 * "empty"`) or for a `ready` list with nothing left to show after the
 * S8-D2 filter below.
 *
 * **Performance audit, responsive-audit Phase 1 (2026-10-28):** `unknown`
 * - the brief moment before `localStorage` has been read at all - now
 * renders the empty state too, not nothing. `localStorage` can't be read
 * during the server render (it doesn't exist there), so `load` always
 * starts `unknown` on first paint regardless of what's actually saved; for
 * the common case (a fresh visitor, nothing saved yet - the one the audit
 * measured), the old "render nothing, then pop in the empty state once
 * `useSavedCards` has read storage" cost a real layout shift (the footer
 * moving down once the empty-state panel appeared below it) and delayed
 * LCP to whenever hydration finished, past budget under mobile throttling
 * (measured 2.8-3.2s LCP / 0.147 CLS against a 2.5s / 0.1 budget). Treating
 * `unknown` as `empty` means that panel is already in the server-rendered
 * HTML, so the common case now has nothing to shift or wait for - verified
 * against the real failure mode, not assumed to fix it.
 *
 * The honest cost, recorded rather than hidden: a returning visitor who
 * *does* have saves now sees the empty-state panel very briefly before it's
 * replaced by the loading skeleton (`unknown` → `loading`), where before it
 * saw nothing in that same window. That's a strictly rarer path (it needs a
 * prior save on this device) and a shorter, lower-stakes flash than the one
 * just fixed - traded deliberately for the fresh-visitor fix, not an
 * oversight.
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
    <div className="min-h-dvh bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      <Container as="main" className="flex flex-col gap-13 pt-10 pb-10 desktop:pb-14">
        <div className="flex flex-col gap-1">
          <Heading level={1} look="display-l" className="desktop:text-display-xl">
            {uk.likes.title}
          </Heading>
          <p className="text-caption text-ink-2">{uk.likes.deviceOnly}</p>
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
      </Container>
    </div>
  );
}
