import type { FeedCardView } from "@opika/contracts";
import type { FeedFilters, GallerySort } from "@opika/domain";
import { uk } from "@opika/i18n";
import { freshnessLabel } from "@opika/ui";
import Image from "next/image";
import Link from "next/link";
import { cardAccessibleName, cardFactsParts, cardSpeciesBadgeTone, isReserved } from "./card-text";
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

const META_SEPARATOR = (
  <span aria-hidden="true" className="h-1 w-[1.5px] shrink-0 bg-brand-ink-2" />
);

interface GalleryCardProps {
  card: FeedCardView;
  /** Pre-resolved by the caller (`cities.list`) - the card never fetches. */
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
      // Off, same reasoning as every other gallery link (`AnimalCard.tsx`'s
      // own comment): the overlay's prefetch-per-visible-card cost against
      // proxy.ts's per-IP budget.
      prefetch={false}
      aria-label={cardAccessibleName(card, cityName)}
      data-testid="animal-card"
      className="relative block aspect-[328/480] overflow-clip rounded-brand-card font-brand-ui focus-ring"
    >
      {/*
        A pulsating skeleton (Figma node `87:1747`, a flat rounded-rect the
        same shape as this card - a static reference frame, so the pulse
        itself is this PR's own addition, "a common approach... skeletons
        pulsating," Oleksii's words mid-build). Sits behind the photo, not
        swapped in by a loading state: the photo covers it the instant it
        paints, and it stays visible for the rare animal with no photo at
        all (`photo` null) rather than leaving that case a blank void,
        which a real scroll-into-view test against the seeded corpus
        actually hit - a photo several rows down was still decoding when
        first screenshotted, with nothing behind it in the pre-skeleton
        build.
      */}
      <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-brand-line" />

      {photo && (
        <Image
          src={photo.storageKey}
          alt=""
          fill
          sizes={SIZES}
          priority={priority}
          className="object-cover"
        />
      )}

      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span
          data-testid="freshness-badge"
          className={`inline-flex items-center rounded-brand-tag px-2 py-1 text-[15px]/[1.2] font-medium text-brand-on-ink ${cardSpeciesBadgeTone(card.species)}`}
        >
          {freshnessLabel(card.freshness)}
        </span>
        {reserved && (
          <span
            data-testid="reserved-badge"
            className="inline-flex items-center rounded-brand-tag bg-brand-ink px-2 py-1 text-[15px]/[1.2] font-medium text-brand-on-ink"
          >
            {uk.reserved.badge}
          </span>
        )}
      </div>

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-4 rounded-brand-panel bg-brand-surface pt-4 pr-5 pb-5 pl-5">
        <div className="flex flex-col gap-2">
          <span
            data-testid="card-name"
            className="truncate text-[26px]/[1.2] font-bold text-brand-ink"
          >
            {card.name}
          </span>
          <span
            data-testid="card-meta"
            className="flex items-center gap-2 text-[16px]/[1.4] font-medium tracking-[0.16px] text-brand-ink-2"
          >
            {facts.map((part, index) => (
              <span key={part} className="flex items-center gap-2">
                {index > 0 && META_SEPARATOR}
                {part}
              </span>
            ))}
          </span>
        </div>
        <span
          aria-hidden="true"
          className="inline-flex min-h-11 w-fit items-center rounded-brand-pill bg-brand-ink px-5 text-[16px]/[1.2] font-semibold text-brand-on-ink"
        >
          {uk.feed.adoptPill}
        </span>
      </div>
    </Link>
  );
}
