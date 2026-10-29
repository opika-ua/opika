import type { FeedCardView } from "@opika/contracts";
import type { FeedFilters, GallerySort } from "@opika/domain";
import { ukPublic as uk } from "@opika/i18n/public";
import { freshnessLabel } from "@opika/ui";
import Link from "next/link";
import { Badge } from "../../ui/Badge";
import { buttonClass } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { MetaLine } from "../../ui/MetaLine";
import { Photo } from "../../ui/Photo";
import { cardAccessibleName, cardFactsParts, isReserved } from "./card-text";
import { animalPageHref, type CitySlugsById } from "./filter-url";

/**
 * The gallery-v3 card (Figma `euz4JGfpToY31VJY7ppVj9`, node `58:1617`) - a
 * new component, not a restyle of `AnimalCard.tsx` in place: that component
 * is shared with the shelter page (`ShelterPageScreen.tsx`) and the saved
 * page (`SavedPageScreen.tsx`), neither of which is in this redesign's
 * scope ("the gallery page and the header, nothing else"). Mutating it
 * would have re-skinned two pages this PR was never asked to touch.
 * `AnimalCard.tsx` and its test are untouched by this PR.
 *
 * Same accessibility contract as `AnimalCard`: one `<a>` per animal, no
 * nested interactive elements (the pill below is a non-interactive
 * `<span>`, owner decision #2), `aria-label` carries the full composed name
 * (`cardAccessibleName`) so none of this card's visible text - the pill
 * included - needs to agree with or extend the accessible name.
 *
 * Unlike `AnimalCard`, there is only one layout at every breakpoint: the
 * design states "cards keep the frame's aspect ratio 328:480 at every
 * width," so there is no separate tablet-horizontal variant to switch to —
 * the reserved tag therefore never needs the short-label/full-label pair
 * `AnimalCard`'s own reserved badge carries for that now-absent case.
 */

/**
 * Derived, not guessed, from the page's own layout
 * (`app/tvaryny/page.tsx`'s main wrapper and this file's grid):
 *
 * Phone (<600, 1 column, no page rail): page padding 16px a side
 * (`px-4`), no card-level inset (the photo fills the card edge to edge in
 * this design, unlike `AnimalCard`'s own padded box) → `100vw - 32px`.
 *
 * Tablet (600-1023, 2 columns): page padding 24px a side (`px-6`), the
 * grid's own gap stays this app's pre-existing 16px here (`gap-4`) - only
 * `desktop:` picks up the frame's new 30px value, per "below 1024px, keep
 * the existing column counts and breakpoints" — so one 16px gap between
 * the two columns → `(100vw - 48 - 16) / 2` = `50vw - 32px`.
 *
 * Desktop+ (>=1024, 4 columns, gap 30, content capped at max-width 1400
 * centred): page padding 56px a side (`px-14`, this PR's own decision -
 * the frame gives the header that gutter and nothing states the main
 * content's, so it reuses the header's number for a consistent column
 * edge). Below the point the 1400 cap binds - `100vw - 112 < 1400`, i.e.
 * viewports under 1512px (the frame's own stated width) - the grid is
 * fluid: `column = (100vw - 112 - 90) / 4` = `25vw - 50.5px`. At and above
 * 1512, the cap binds and a column is a flat `(1400 - 90) / 4` = `327.5px`,
 * rounded up to 328 - matching the aspect-ratio's own first number, which
 * is this derivation's own check on itself, not a coincidence stated
 * without proof.
 */
const SIZES =
  "(max-width: 599px) calc(100vw - 32px), (max-width: 1023px) calc(50vw - 32px), (max-width: 1511px) calc(25vw - 50.5px), 328px";

interface GalleryCardProps {
  card: FeedCardView;
  /** Pre-resolved by the caller (from `cityLabels`) - the card never fetches. */
  cityName: string | null;
  priority?: boolean;
  /**
   * Pet card PR 5, decision B: the gallery's own current filter and sort,
   * carried on every card's own href so the overlay (opened by clicking this
   * link) can ask `animals.neighbours` for the right walk through the same
   * result set this card is part of - not threaded for any reason of this
   * card's own.
   */
  filters: FeedFilters;
  sort: GallerySort;
  citySlugs: CitySlugsById;
}

export function GalleryCard({
  card,
  cityName,
  priority = false,
  filters,
  sort,
  citySlugs,
}: GalleryCardProps) {
  const photo = card.primaryPhoto;
  const reserved = isReserved(card.listingKind);
  const facts = cardFactsParts(card);

  return (
    <Link
      href={animalPageHref(card.id, filters, sort, citySlugs)}
      // Off: the overlay's prefetch per visible card would eat proxy.ts's per-IP budget.
      prefetch={false}
      aria-label={cardAccessibleName(card, cityName)}
      data-testid="animal-card"
      className="relative block overflow-clip rounded-card focus-ring"
    >
      <Photo
        src={photo?.storageKey ?? null}
        alt=""
        sizes={SIZES}
        aspect="card"
        priority={priority}
      />

      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span data-testid="freshness-badge" className="contents">
          <Badge tone={card.species}>{freshnessLabel(card.freshness)}</Badge>
        </span>
        {reserved && (
          <span data-testid="reserved-badge" className="contents">
            <Badge tone="ink">{uk.reserved.badge}</Badge>
          </span>
        )}
      </div>

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-4 rounded-panel bg-surface p-5">
        <div className="flex flex-col gap-2">
          <span data-testid="card-name" className="truncate text-title text-ink">
            {card.name}
          </span>
          <span data-testid="card-meta" className="contents">
            <MetaLine parts={facts} />
          </span>
        </div>
        <span aria-hidden="true" className={cx(buttonClass("primary"), "w-fit")}>
          {uk.feed.adoptPill}
        </span>
      </div>
    </Link>
  );
}
