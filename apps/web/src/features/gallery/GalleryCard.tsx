import type { FeedCardView } from "@opika/contracts";
import type { FeedFilters, GallerySort } from "@opika/domain";
import { ukPublic as uk } from "@opika/i18n/public";
import { freshnessLabel } from "@opika/ui";
import Link from "next/link";
import { Badge } from "../../ui/Badge";
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
 * Two layouts of one DOM (`layout`): on a phone the text sits under the photo with the freshness as
 * a species-coloured dot plus its words; from `tablet` the gallery keeps the Figma panel over the
 * photo. The pill is decorative and exists only in that panel.
 */

/**
 * `sizes` per layout (page padding 16px phone / 24px tablet / 56px desktop, content capped at 1400).
 * Phone: two columns with a 12px gap, so a column is `(100vw - 32 - 12) / 2` = `50vw - 22px`.
 * Tablet: the gallery keeps two columns (16px gap, `50vw - 32px`); the shelter page uses three
 * (`33.4vw - 26px`, rounded up). Desktop: four columns, 30px gap, fluid `25vw - 50.5px` until the
 * 1400 cap binds at 1512px, then a flat 328px.
 */
const SIZES = {
  responsive:
    "(max-width:599px) calc(50vw - 22px),(max-width:1023px) calc(50vw - 32px),(max-width:1511px) calc(25vw - 50.5px),328px",
  stacked:
    "(max-width:599px) calc(50vw - 22px),(max-width:1023px) calc(34vw - 26px),(max-width:1511px) calc(25vw - 50.5px),328px",
} as const;

// Sets `--dot`: the phone's dot and, from tablet, the badge fill.
const SPECIES = { dog: "gcard-dog", cat: "gcard-cat" } as const;

interface GalleryCardProps {
  card: FeedCardView;
  /** Pre-resolved by the caller (from `cityLabels`) - the card never fetches. */
  cityName: string | null;
  priority?: boolean;
  /**
   * `responsive` (the gallery): the text sits under the photo on a phone and in a panel over it
   * from `tablet`. `stacked` (the shelter page): under the photo at every width.
   */
  layout?: "responsive" | "stacked";
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
  layout = "responsive",
  filters,
  sort,
  citySlugs,
}: GalleryCardProps) {
  const photo = card.primaryPhoto;
  const reserved = isReserved(card.listingKind);
  const facts = cardFactsParts(card);
  const stacked = layout === "stacked";

  return (
    <Link
      href={animalPageHref(card.id, filters, sort, citySlugs)}
      // Off: the overlay's prefetch per visible card would eat proxy.ts's per-IP budget.
      prefetch={false}
      aria-label={cardAccessibleName(card, cityName)}
      data-testid="animal-card"
      className={stacked ? "gcard-st" : "gcard"}
    >
      <Photo
        src={photo?.storageKey ?? null}
        alt=""
        sizes={SIZES[layout]}
        aspect={stacked ? "portrait" : "cardStacked"}
        priority={priority}
        className={stacked ? "rounded-card tablet:rounded-none" : ""}
      />
      {/* `contents` on a phone: the badge floats on the photo, the freshness joins the text column
          (order-last). From `tablet` the same two elements sit in one row on the photo. */}
      <div className={stacked ? "contents" : "gcard-badges"}>
        <span
          data-testid="freshness-badge"
          className={
            stacked
              ? cx("gcard-fresh-st", SPECIES[card.species])
              : cx("gcard-fresh", SPECIES[card.species])
          }
        >
          {freshnessLabel(card.freshness)}
        </span>
        {reserved && (
          <span data-testid="reserved-badge" className="contents">
            <Badge tone="ink" className="absolute top-2 left-2 tablet:static">
              {uk.reserved.badge}
            </Badge>
          </span>
        )}
      </div>

      <div className={stacked ? "gcard-info-st" : "gcard-info"}>
        <span data-testid="card-name" className={stacked ? "gcard-name-st" : "gcard-name"}>
          {card.name}
        </span>
        <MetaLine parts={facts} size="caption" testId="card-meta" />
        {!stacked && (
          <span aria-hidden="true" className="gcard-pill">
            {uk.feed.adoptPill}
          </span>
        )}
      </div>
    </Link>
  );
}
