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
    "(max-width: 599px) calc(50vw - 22px), (max-width: 1023px) calc(50vw - 32px), (max-width: 1511px) calc(25vw - 50.5px), 328px",
  stacked:
    "(max-width: 599px) calc(50vw - 22px), (max-width: 1023px) calc(34vw - 26px), (max-width: 1511px) calc(25vw - 50.5px), 328px",
} as const;

const SPECIES_DOT = { dog: "bg-species-dog", cat: "bg-species-cat" } as const;

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
      className={cx(
        "relative flex flex-col gap-3 focus-ring",
        !stacked && "tablet:block tablet:overflow-clip tablet:rounded-card",
      )}
    >
      <div className="relative">
        <Photo
          src={photo?.storageKey ?? null}
          alt=""
          sizes={SIZES[layout]}
          aspect={stacked ? "portrait" : "cardStacked"}
          priority={priority}
          className="rounded-card tablet:rounded-none"
        />
        {/* Only «Домовляються» stays on the photo on a phone; the freshness moved under it. */}
        <div className="absolute inset-x-2 top-2 flex flex-wrap items-start gap-2 tablet:inset-x-4 tablet:top-4">
          {!stacked && (
            <span data-testid="freshness-badge" className="hidden tablet:contents">
              <Badge tone={card.species}>{freshnessLabel(card.freshness)}</Badge>
            </span>
          )}
          {reserved && (
            <span data-testid="reserved-badge" className="contents">
              <Badge tone="ink">{uk.reserved.badge}</Badge>
            </span>
          )}
        </div>
      </div>

      <div
        className={cx(
          "flex flex-col gap-1",
          !stacked &&
            "tablet:absolute tablet:inset-x-3 tablet:bottom-3 tablet:gap-4 tablet:rounded-panel tablet:bg-surface tablet:p-5",
        )}
      >
        <div className={cx("flex flex-col gap-1", !stacked && "tablet:gap-2")}>
          <span
            data-testid="card-name"
            className={cx(
              "line-clamp-2 break-words text-label text-ink",
              !stacked && "tablet:line-clamp-1 tablet:text-title",
            )}
          >
            {card.name}
          </span>
          <span data-testid="card-meta" className="contents">
            <MetaLine parts={facts} size="caption" />
          </span>
        </div>
        <span
          data-testid="card-freshness"
          className={cx(
            "flex items-center gap-2 text-caption text-ink-2",
            !stacked && "tablet:hidden",
          )}
        >
          <span
            aria-hidden="true"
            className={cx("size-2 shrink-0 rounded-pill", SPECIES_DOT[card.species])}
          />
          {freshnessLabel(card.freshness)}
        </span>
        {!stacked && (
          <div className="hidden tablet:block">
            <span aria-hidden="true" className={cx(buttonClass("primary"), "w-fit")}>
              {uk.feed.adoptPill}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
