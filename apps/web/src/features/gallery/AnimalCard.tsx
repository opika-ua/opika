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
   * carrier networks. The caller passes `true` for a small prefix of cards
   * (`PRIORITY_ROW_SIZE`, `apps/web/src/app/tvaryny/page.tsx`) sized to the
   * *tablet* breakpoint's column count, not the widest one — a wider count
   * would mean most of those "priority" preloads compete with the real LCP
   * image for bandwidth at phone width, where only the first is ever on
   * screen.
   */
  priority?: boolean;
  /**
   * The mock's third card variant (`docs/design/README.md`, "The gallery
   * card" > "Resolved") — fill-strong background, the decorative-only
   * placeholder stripe, and the pips replaced by "Притулок каже: {name} уже
   * вдома." instead of freshness. Never set by any real caller today:
   * `FeedCardView["listingKind"]` is `DISCOVERABLE_LISTING_KINDS`-narrowed
   * (`published | reserved`, `packages/contracts/src/views/animal.ts`) and
   * cannot carry "adopted" — the gallery/feed query never returns an
   * adopted animal at all (`packages/domain/src/animals/listing.ts`).
   * Widening that predicate is a data-model decision for a future phase,
   * not this one; this prop exists so the *rendering* is real and tested
   * (`AnimalCard.test.tsx`) rather than an unbuilt corner of the mock, with
   * no live path exercising it until that decision is made.
   */
  resolved?: boolean;
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
export function AnimalCard({
  card,
  cityName,
  priority = false,
  resolved = false,
}: AnimalCardProps) {
  const reserved = !resolved && isReserved(card.listingKind);
  const photo = card.primaryPhoto;
  const fills = freshnessPips(card.freshness.kind);

  return (
    <Link
      href={`/tvaryny/${card.id}`}
      // F1 shipped a real destination at this URL (docs/gallery-contract-
      // decisions.md §6) — prefetch stays off regardless. Next's default
      // prefetch fires one request per visible card, and every one of those
      // passes through proxy.ts's rate limiter alongside the page's own
      // request (its matcher covers /tvaryny/:path* on purpose, for exactly
      // this route). Left on, a single 24-card gallery page load could burn
      // a meaningful slice of the 100-req/min budget on prefetches nobody
      // asked for — reproduced directly by
      // test/harness/gallery-layout.harness.ts, which started getting
      // 429'd mid-run before this was set. Still the right trade with a
      // real destination behind it: a click is a real navigation either
      // way, prefetch only ever saved the time between hover and click.
      prefetch={false}
      aria-label={cardAccessibleName(card, cityName)}
      data-testid="animal-card"
      className={`font-rg flex flex-col tablet:flex-row desktop:flex-col gap-4 tablet:gap-3 desktop:gap-4 rounded-rg-card p-3 box-border transition-colors duration-[120ms] ease-rg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] ${
        resolved ? "bg-rg-fill-strong" : "bg-rg-surface hover:bg-rg-surface-hover"
      }`}
    >
      {/*
        Vertical (phone, desktop): full-width, 4:5. Horizontal (tablet,
        600-1023): fixed 120px column, height from flex stretch rather than
        aspect-ratio — the two rules would otherwise compete over which one
        sizes the box.
      */}
      <div
        data-testid="card-photo"
        className={`relative shrink-0 w-full aspect-[4/5] tablet:w-30 tablet:aspect-auto desktop:w-full desktop:aspect-[4/5] rounded-rg-photo overflow-hidden ${
          resolved ? "bg-rg-photo-placeholder-resolved" : "bg-rg-photo-placeholder"
        }`}
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
          docs/design/README.md, "The gallery card" > "Reserved": "an
          #FFFFFF pill... bottom-left inside the photo at 12px inset." Two
          text nodes, complementary visibility, rather than one node with
          breakpoint-conditional content — CSS cannot swap text, only which
          element is displayed.
        */}
        {reserved && (
          <span
            data-testid="reserved-badge"
            className="absolute bottom-3 left-3 min-h-8 flex items-center rounded-rg-chip bg-rg-surface px-3.5 font-medium text-[13px] leading-none text-rg-ink"
          >
            <span className="tablet:hidden desktop:inline">{uk.reserved.badge}</span>
            <span className="hidden tablet:inline desktop:hidden">{uk.reserved.badgeShort}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 px-2 pb-2 min-w-0">
        <div className="flex flex-col gap-1">
          <span
            data-testid="card-name"
            className="font-bold text-[24px]/[28px] tablet:text-[22px]/[26px] tracking-[-0.02em] text-rg-ink truncate"
          >
            {card.name}
          </span>

          <span data-testid="card-meta" className="text-[15px]/[22px] text-rg-ink-2">
            {cardMetaLine(card, cityName)}
          </span>
        </div>

        {/*
          No boxed freshness block and no shelter sentence here, unlike the
          deck: "The shelter's sentence is NOT on gallery cards" —
          docs/design/README.md, "The Gallery" > "Card". The resolved variant
          replaces this row entirely with the shelter's own sentence instead
          of freshness — "Different fill and different text — never
          dimming" (docs/design/README.md, "The gallery card" > "Resolved").
        */}
        {resolved ? (
          <span className="text-[15px]/[22px] text-rg-ink">
            {uk.resolved.sentence.replace("{name}", card.name)}
          </span>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5" aria-hidden="true">
              {fills.map((fill, i) => (
                <div
                  key={i}
                  data-testid="freshness-pip"
                  data-filled={fill === "empty" ? "false" : "true"}
                  className={`size-2.5 rounded-full ${
                    fill === "empty" ? "bg-transparent border-[1.5px] border-rg-ink-3" : fill
                  }`}
                />
              ))}
            </div>
            <span className="text-[15px]/[22px] text-rg-ink">{freshnessLabel(card.freshness)}</span>
          </div>
        )}

        {/*
          "· перевірений" carries no colour of its own — docs/design/README.md,
          "The gallery card": "caption 13/18 #63676B ... (no colour;
          verification is stated, not tinted)." The resolved variant's
          shelter line is ink-2, not ink-3 — the one other place this card's
          text departs from the standard/reserved caption colour
          (`Opika Registry System.dc.html`'s own B5 resolved-card frame).
        */}
        <div
          data-testid="shelter-line"
          className={`text-[13px]/[18px] ${resolved ? "text-rg-ink-2" : "text-rg-ink-3"}`}
        >
          {card.shelter.displayName}
          {card.shelter.verification === "verified" && " · перевірений"}
        </div>
      </div>
    </Link>
  );
}
