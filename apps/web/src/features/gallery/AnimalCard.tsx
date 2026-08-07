import type { FeedCardView } from "@opika/contracts";
import { uk } from "@opika/i18n";
import { freshnessLabel, freshnessPips } from "@opika/ui";
import Image from "next/image";
import Link from "next/link";
import { cardAccessibleName, cardMetaLine, isReserved } from "./card-text";

/**
 * The photo's rendered width by breakpoint: full card width on phone (1
 * column), a fixed 120px on tablet (`w-30`, not viewport-relative at all),
 * roughly a third of the 960px content column on desktop (3 columns), a
 * quarter of 1320px on wide (4 columns) — `globals.css`'s `tablet`/
 * `desktop`/`wide` breakpoints, `docs/design/README.md`'s own numbers.
 * Doesn't change what loads today (`image-loader.ts`'s stub has no real
 * variants to choose between), but is the value H1's real variants need
 * this component to already be passing.
 */
const PHOTO_SIZES =
  "(max-width: 599px) 100vw, (max-width: 1023px) 120px, (max-width: 1439px) 320px, 330px";

interface AnimalCardProps {
  card: FeedCardView;
  /** Pre-resolved by the caller (`cities.list`) — the card never fetches. */
  cityName: string | null;
  /**
   * `next/image`'s `loading="lazy"` default is right for a 24-card grid
   * where most cards start below the fold — but it also applies to the
   * cards that don't, on a page whose entire content is photographs, for
   * an audience the ADR names specifically as Ukrainian mobile users on
   * carrier networks. The caller passes `true` for the first 4 cards — the
   * `wide` breakpoint's column count (`globals.css`), a superset of every
   * narrower breakpoint's first row, so whichever layout actually renders,
   * that row is never left lazy.
   */
  priority?: boolean;
}

/**
 * docs/design/README.md, "The Gallery" > "Card". One `<a>` per animal, no
 * nested interactive elements, so Tab stops once per card — see
 * docs/gallery-contract-decisions.md §6 for why the destination resolves to
 * nothing until Phase F, and why that's the right trade for E1 regardless.
 *
 * One DOM tree reflowing by breakpoint, not two components switched by
 * viewport: a Server Component cannot know the client's width, and the
 * gallery must render correctly with no JS at all (docs/design/README.md,
 * "Pagination — not infinite scroll" makes the same no-JS requirement for
 * the page around this card). `tablet:`/`desktop:`/`wide:` are this repo's
 * own breakpoint names (globals.css), matching the design's 600/1024/1440
 * cut points rather than Tailwind's stock scale.
 */
export function AnimalCard({ card, cityName, priority = false }: AnimalCardProps) {
  const reserved = isReserved(card.listingKind);
  const photo = card.primaryPhoto;
  const fills = freshnessPips(card.freshness.kind);

  return (
    <Link
      href={`/tvaryny/${card.id}`}
      // The destination 404s until Phase F (docs/gallery-contract-decisions.md
      // §6) — nothing to prefetch yet. Also load-bearing, not just wasted
      // work: Next's default prefetch fires one request per visible card, and
      // every one of those passes through proxy.ts's rate limiter alongside
      // the page's own request (its matcher covers /tvaryny/:path* on
      // purpose, for the eventual real detail pages). Left on, a single
      // 24-card gallery page load could burn a meaningful slice of the
      // 100-req/min budget on prefetches nobody asked for — reproduced
      // directly by test/harness/gallery-layout.harness.ts, which started
      // getting 429'd mid-run before this was set. Revisit once F ships a
      // real destination worth prefetching.
      prefetch={false}
      aria-label={cardAccessibleName(card, cityName)}
      data-testid="animal-card"
      className="group flex flex-col tablet:flex-row desktop:flex-col gap-3 rounded-card border border-line-strong bg-paper p-3 box-border hover:border-line-heavy focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf focus-visible:outline-offset-2 transition-colors duration-[160ms]"
    >
      {/*
        Vertical (phone, desktop): full-width, 4:5. Horizontal (tablet,
        600-1023): fixed 120px column, height from flex stretch rather than
        aspect-ratio — the two rules would otherwise compete over which one
        sizes the box.
      */}
      <div
        data-testid="card-photo"
        className="relative shrink-0 w-full aspect-[4/5] tablet:w-30 tablet:aspect-auto desktop:w-full desktop:aspect-[4/5] rounded-photo overflow-hidden bg-photo-placeholder"
      >
        {photo && (
          <Image
            src={photo.storageKey}
            alt=""
            fill
            sizes={PHOTO_SIZES}
            priority={priority}
            className="object-cover"
          />
        )}

        {/*
          docs/design/README.md: "8px inset (6px on the tablet card, labelled
          'Домовляються')." Two text nodes, complementary visibility, rather
          than one node with breakpoint-conditional content — CSS cannot swap
          text, only which element is displayed.
        */}
        {reserved && (
          <span
            data-testid="reserved-badge"
            className="absolute bottom-2 left-2 tablet:bottom-1.5 tablet:left-1.5 desktop:bottom-2 desktop:left-2 min-h-7 flex items-center rounded-chip bg-avatar-bg px-2.5 font-sans font-medium text-[11px] leading-none text-[#3D3226]"
          >
            {/* #3D3226 is a design value with no named token — docs/design/README.md's own colour table doesn't list it either; see globals.css for the precedent (bg-photo-placeholder's #F6EFE3) for keeping a genuine one-off as an arbitrary value instead of inventing a token for it. */}
            <span className="tablet:hidden desktop:inline">{uk.reserved.badge}</span>
            <span className="hidden tablet:inline desktop:hidden">{uk.reserved.badgeShort}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 px-1 pb-1 min-w-0">
        <span
          data-testid="card-name"
          className="font-serif font-medium text-[20px]/[24px] tablet:text-[18px]/[21.6px] desktop:text-[19px]/[22.8px] text-ink truncate group-hover:underline underline-offset-[3px]"
        >
          {card.name}
        </span>

        <span data-testid="card-meta" className="font-sans text-[12px]/[16.8px] text-ink-3">
          {cardMetaLine(card, cityName)}
        </span>

        {/*
          No boxed freshness block and no shelter sentence here, unlike the
          deck: "The shelter's sentence is NOT on gallery cards" —
          docs/design/README.md, "The Gallery" > "Card".
        */}
        <div className="flex items-center gap-row">
          <div className="flex gap-label" aria-hidden="true">
            {fills.map((fill, i) => (
              <div
                key={i}
                data-testid="freshness-pip"
                data-filled={fill ? "true" : "false"}
                className={`size-1.75 rounded-full ${fill ?? "bg-transparent border border-line-heavy"}`}
              />
            ))}
          </div>
          <span className="font-sans text-[12px]/[16.8px] text-ink-2">
            {freshnessLabel(card.freshness)}
          </span>
        </div>

        <div data-testid="shelter-line" className="font-sans text-[11px]/[14.3px] text-ink-3">
          {card.shelter.displayName}
          {card.shelter.verification === "verified" && (
            <span className="text-leaf"> · перевірений</span>
          )}
        </div>
      </div>
    </Link>
  );
}
