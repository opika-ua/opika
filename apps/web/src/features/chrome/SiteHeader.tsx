import { uk } from "@opika/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { WORDMARK } from "../../brand";
import { SavedNavLink } from "../likes/SavedNavLink";
import { BrandLogo } from "./BrandLogo";
import { MobileNavMenu } from "./MobileNavMenu";

/**
 * The one header, on every user-facing surface except the deck.
 *
 * Phase T. Before this, three routes each carried their own near-identical
 * `<header>` and the detail page carried no wordmark at all - its own comment
 * recorded that as deliberate, reasoning the wordmark shouldn't repeat "a
 * second time on every route," while citing that mock D1 shows it. The design
 * critique found the consequence: `/tvaryny/{id}` is the URL people paste into
 * Telegram, and it arrived with no brand and no route to «Про проєкт», which
 * was itself linked from exactly one place in the whole app (the gallery
 * footer, below a ten-page grid). That is critique findings E5, E1, B2 and E7,
 * and they are one wound with one fix.
 *
 * **Not the deck.** `docs/design/README.md:589` is explicit - "the deck's
 * header *replaces* the gallery header - never two navigations at once" — and
 * the deck already has an unambiguous way out («← До списку») to a surface
 * that does carry this. None of the four findings above concern the deck, so
 * honouring that decision costs nothing. Confirmed with the owner rather than
 * assumed, since overriding it would have been a design change wearing a
 * bug-fix label.
 *
 * ## What is specified and what is composed
 *
 * No mock frame exists for this component; `docs/design/README.md`'s prose is
 * therefore the spec, per `docs/standing-constraints.md`'s "when no mock
 * exists, the prose is the spec."
 *
 * Specified, and followed:
 * - Surface white, no bottom border; min-height 88 desktop / 64 mobile
 *   (line 337). The old headers were `min-h-14 tablet:min-h-16
 *   desktop:min-h-17` - 56/64/68px - which is critique finding A2, under the
 *   project's own civic-trust touch-target floor at two of three breakpoints.
 * - Wordmark 26/700/−0.03em desktop, 22 on mobile (line 225). Previously a
 *   flat `text-[19px]`, matching neither.
 * - 48px minimum touch target (line 200) on every link here.
 *
 * Composed, because the prose does not cover it:
 * - **The nav links themselves.** Line 337's content list is "mark + wordmark,
 *   city chip, spacer, «Мої запити · N», «UA / EN», «Гортати по одній»" —
 *   «Про проєкт» and «Для притулків» are not in it. They are added to close
 *   E5/E1/E3 and are composed from the same `bg-rg-fill` pill primitive the
 *   list's own «Гортати по одній» uses, rather than a new visual idiom.
 *
 * The city chip and «Мої запити · N» remain absent for the same reason they
 * always were: My Reveals and i18n are later phases. Unchanged by this one.
 *
 * **O-1 (`docs/observations.md`), 2026-09-10 - the mark shipped.** This file's
 * own comment used to record the mark asset as absent, "the honest half
 * rather than inventing a mark to fill a spec line." The design doc's "The
 * logo - «Поріг · Межа»" section names the geometry exactly (a 96-grid path,
 * not an image asset to source), so drawing it is following the spec, not
 * inventing one: arch `M22 70 V46 a26 26 0 0 1 52 0 v24`, threshold
 * `M14 88 h68` (both stroke 10, round caps), dot `cx=48 cy=79 r=6` (filled).
 * Ink `#101112` only (`currentColor`, via `text-rg-ink`). Lockup: 30px
 * desktop / 26px mobile.
 *
 * **Correction, 2026-09-10 - Oleksii caught the mark floating above the
 * wordmark in a real screenshot** (a rendered defect, not visible from
 * markup - exactly the class `docs/standing-constraints.md`'s "requires a
 * rendered assertion" exists for). The original lockup used `items-end`,
 * which aligns the mark's own *box* bottom to the wordmark's line-box
 * bottom - not the same point as the spec's "align optically to the
 * threshold line, not the box." Two gaps, not stacked but *net*: a CSS line
 * box extends below the true text baseline by the font's descent plus half
 * its leading (this font/size: 5px descent + 4px half-leading = 9px at
 * 26px/desktop), while the mark's own viewBox reserves 8 of its 96 units as
 * clear space *above* the box's own bottom edge, i.e. the threshold sits
 * 2.5px higher than the box bottom at 30px. 9 minus 2.5 nets the 6.5px the
 * mutated build actually measured - confirmed by measuring both in a live
 * render (canvas `measureText` against the wordmark's real computed font for
 * ascent/descent/line-height; the SVG's own client rect against the design
 * doc's stated 88/96 threshold position - not estimated from the SVG path by
 * eye). Fixed with `items-baseline` (aligns the mark's box bottom to the
 * wordmark's true typographic baseline via the browser's flex baseline
 * synthesis for a replaced element) plus `translate-y-[8.3333%]` - a
 * percentage translate resolves against the mark's own border box, so one
 * value (8/96, the clear-space fraction baked into the viewBox) covers both
 * the 26px mobile and 30px desktop sizes with no separate magic number to
 * keep in sync with `w-[26px]`/`desktop:w-[30px]`. Verified against real
 * measured pixels: threshold Y now equals baseline Y within a fraction of a
 * pixel at both sizes, not merely close. `site-header.harness.ts`'s "the
 * mark's threshold sits on the wordmark's baseline" test pins this at both
 * the `<span>` (self-link-suppressed) and `<Link>` lockup branches,
 * mutation-confirmed red against the original `items-end` reverted.
 *
 * Gap to the wordmark is `gap-3` (12px) - **not** a literal rendering of
 * "the dot's own height," which the spec states in the mark's 96-unit grid
 * (a 12-unit diameter) and which scales down to ~3.75px at the 30px desktop
 * mark (~3.25px at 26px mobile) once actually rendered. That literal value
 * reads as the mark and the wordmark touching, not a deliberate gap, at
 * this lockup's real size - 12px is a practical rounding chosen for visible
 * breathing room, recorded here as a deviation rather than claimed as an
 * exact match with no mock available to check a different number against.
 * **Not built:** the 16/24px dot-dropped variant and the favicon (white mark
 * on an `#101112` rounded square) - the spec calls for both only at sizes
 * this header never renders at, and a browser favicon is a separate asset
 * pipeline (`app/icon.*`), not a header-lockup concern this observation
 * raised.
 *
 * **O-8 (`docs/observations.md`), 2026-09-10 - the `leading` slot removed.**
 * Previously existed solely for the detail page's back-link, rendered beside
 * the wordmark where it read as a site nav item rather than the page's own
 * control. Moved into `AnimalDetailScreen.tsx`'s own layout, below the
 * header - this component no longer has a `leading` prop, since nothing
 * populates it anymore. The `flex-wrap` the slot's own content used to need
 * at 360px stays - see the header element's own comment on why it's still
 * load-bearing without `leading`, for an unrelated reason (O-1's logo mark).
 *
 * **gallery-v3 re-skin (Figma `euz4JGfpToY31VJY7ppVj9`, node `58:1617`).**
 * This header is in that frame, and "the header is shared, so it changes on
 * every route" is the hand-off's own words — unlike the gallery page itself,
 * this component's restyle is not scoped to `/tvaryny`. The hand-drawn
 * `LogoMark` above is retired in favour of `BrandLogo` (a static asset,
 * `public/brand-v3/logo.svg` - see that file's own comment for why), and
 * every colour/radius/font class below moved from the `rg-` token set to the
 * `brand-` one (`globals.css`). 72px tall / 56px side gutters at desktop are
 * the frame's own numbers; mobile/tablet keep this component's pre-existing
 * values, since the frame specifies desktop only and "no mock, no invented
 * layout" extends to this header's narrow-viewport case the same way it
 * does to the gallery page's.
 */

/** The product's name (`brand.ts`, the one constant), re-exported for the wordmark's readers. */
export { WORDMARK };

export interface SiteHeaderProps {
  /** Surface-specific trailing actions, after the nav - the gallery's deck entry. */
  readonly children?: ReactNode;
  /**
   * Suppresses the link on the wordmark when this *is* the gallery. A link to
   * the page you are already on is a WCAG 2.4.4-adjacent annoyance and a
   * wasted Tab stop; `aria-current` on a self-link is the alternative and is
   * worse here, because the wordmark is not navigation the user is choosing
   * between.
   */
  readonly wordmarkIsCurrentPage?: boolean;
  /**
   * Designer feedback batch D (2026-10-23): a signed-in shelter admin or the
   * operator doesn't see visitor-only items - no `children` (every current
   * caller's is adopter-only: the deck entry link), and «Збережені» becomes
   * «Кабінет». No default: every caller decides this from its own request,
   * via `kabinetSessionCookiePresent()` (`kabinet-signed-in.ts`) - a silent
   * default here would be exactly the kind of place a caller's omission
   * goes unnoticed.
   */
  readonly kabinetSignedIn: boolean;
}

/**
 * `shrink-0` + `whitespace-nowrap`. Added 2026-09-12 while chasing a
 * CI-only horizontal-overflow failure at 320px, on the theory that this nav
 * caused it. **It did not** - the overflow was the gallery's own mobile
 * toolbar row (`app/tvaryny/page.tsx`), and the CI failure reproduced
 * unchanged after this landed. Corrected here rather than reverted because
 * the measurement behind it was real, even though the diagnosis was not: at
 * 320 the two labels plus their gap came to *exactly* 288.0px against
 * exactly 288px of available width, so the nav rendered with zero slack and
 * Chromium wrapped a label internally ("Для" / "притулків" stacked inside
 * one pill). That is a legibility defect on its own, but it could never
 * push the page sideways - the nav is a flex child capped at its
 * container's 288px, and measured `scrollWidth === clientWidth === 288`
 * both with and without these classes. Matches `Footer.tsx`'s own pattern
 * for the identical two-link case: the whole pill wraps to its own row
 * (`flex-wrap` on the parent `nav`, below) rather than the pill's internal
 * text wrapping.
 */
/**
 * ui 600, 20/1.2, ink; gap 40 between links (`gap-10`) - the frame's own
 * type-scale row for "Header nav links". Bare text, no pill - Figma's own
 * node geometry for this nav (`58:1698`)
 * is a 24px-tall text box with nothing behind it, not the earlier
 * `bg-brand-line` pill this file shipped first (Oleksii, mid-build: "our
 * header links look much different than on Figma"). The 48px touch-target
 * floor is still met, just invisibly: `min-h-12` extends the hit area
 * *vertically* around the 20px text with no background to show it, and
 * carries no horizontal padding, so the flex row's `gap-10` (40px) still
 * measures text-edge to text-edge exactly as the frame does - adding
 * horizontal padding here would have widened that gap by twice the
 * padding without changing what's visible.
 */
const NAV_LINK_CLASS =
  "font-brand-ui inline-flex min-h-12 shrink-0 items-center whitespace-nowrap " +
  "text-[20px]/[1.2] font-semibold text-brand-ink transition-colors duration-[120ms] " +
  "hover:text-brand-accent focus-visible:outline focus-visible:outline-[3px] " +
  "focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]";

/**
 * `sr-only`, not visible text: the lockup image (`BrandLogo`) already draws
 * "Opika" as part of its artwork, so a second, visible rendering of the same
 * word would duplicate it on screen. This span exists purely so the
 * accessible name (and, for the `wordmarkIsCurrentPage` branch, the literal
 * `.textContent` `SiteHeader.test.tsx` and the harness both read) stays
 * "Opika" regardless of which branch renders - the image itself is
 * `aria-hidden` and contributes nothing to either.
 */
function WordmarkText() {
  return <span className="sr-only">{WORDMARK}</span>;
}

/**
 * The header's own nav links, factored out so the one conditional
 * (Кабінет for a signed-in shelter admin/operator, «Збережені» otherwise)
 * is never written twice in two different shapes - both the inline
 * `<nav>` (`tablet:` and up) and `MobileNavMenu`'s drawer (below
 * `tablet:`) render this same component, just inside different wrappers.
 *
 * `testIdSuffix`: both call sites render in the DOM at once regardless of
 * which width actually shows which one (the drawer's own closed `<dialog>`
 * hides its copy from the accessibility tree, not from the DOM - see
 * `MobileNavMenu`'s own comment) - sharing one `data-testid` between the
 * two would make every existing `page.locator("[data-testid='nav-about']")`
 * style query in `site-header.harness.ts` resolve to two elements, a
 * strict-mode violation found by actually running that suite, not assumed
 * safe. The suffix keeps the tablet-and-up nav's ids exactly as they were
 * (empty string) so none of that existing harness needs to change, and
 * gives the drawer's own copies their own distinct ids.
 */
function NavLinks({
  kabinetSignedIn,
  linkClassName,
  testIdSuffix = "",
}: {
  kabinetSignedIn: boolean;
  linkClassName: string;
  testIdSuffix?: string;
}) {
  return (
    <>
      <Link
        href="/prytulkam"
        data-testid={`nav-for-shelters${testIdSuffix}`}
        className={linkClassName}
      >
        {uk.nav.forShelters}
      </Link>
      <Link href="/pro" data-testid={`nav-about${testIdSuffix}`} className={linkClassName}>
        {uk.nav.about}
      </Link>
      {kabinetSignedIn ? (
        <Link href="/kabinet" data-testid={`nav-kabinet${testIdSuffix}`} className={linkClassName}>
          {uk.nav.kabinet}
        </Link>
      ) : (
        // S8: the saved page (`/zberezheni`), linked from every surface the
        // header is on - but only while there's something saved to link to
        // (Oleksii, from a live screenshot: "show Збережені tab in header
        // only if we have something saved otherwise hide it").
        <SavedNavLink className={linkClassName} testId={`nav-saved${testIdSuffix}`} />
      )}
    </>
  );
}

export function SiteHeader({
  children,
  wordmarkIsCurrentPage = false,
  kabinetSignedIn,
}: SiteHeaderProps) {
  return (
    <header
      data-testid="site-header"
      /*
        `flex-wrap`/`tablet:flex-nowrap` removed (hamburger-menu pass) - re-verified by
        rendering, not assumed: it was load-bearing only for the inline `<nav>`'s own content
        needing room below `tablet:` (O-8's history, still true when this was written). Now
        that the nav renders nowhere below `tablet:` at all (hidden; `MobileNavMenu`'s drawer
        carries the same links instead), there is only ever one row's worth of content at any
        width - the logo and, below `tablet:`, the hamburger trigger - so nothing is left to
        wrap. Confirmed zero overflow at 320/360/390px with the class removed, both with and
        without the drawer open.
        72px desktop height / 56px desktop side gutters are the gallery-v3
        frame's own numbers; mobile/tablet keep this component's pre-existing
        values (see this file's top comment). `sticky top-0`: Oleksii,
        mid-build - "header must be sticky." `z-30`, not the default
        stacking order: this is site-wide chrome (every route but the
        deck), so it has to stay above whatever scrolls beneath it on every
        one of them, while staying below `FilterSheet`'s own `z-50` modal,
        which must still cover it when open.
      */
      className="sticky top-0 z-30 min-h-16 desktop:min-h-18 flex items-center gap-3 desktop:gap-4 bg-brand-page px-4 tablet:px-6 desktop:px-14 py-2 tablet:py-0"
    >
      {wordmarkIsCurrentPage ? (
        <span data-testid="site-wordmark" className="inline-flex items-center">
          <BrandLogo />
          <WordmarkText />
        </span>
      ) : (
        // Not prefetched: `/tvaryny` is charged to the visitor's per-IP budget
        // (`proxy.ts`), and the animal page, which the gallery's overlay
        // shows, carries this header (DR1-S4-T3's reason, S4b).
        <Link
          href="/tvaryny"
          prefetch={false}
          data-testid="site-wordmark"
          className="inline-flex min-h-12 items-center rounded-brand-field focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-accent focus-visible:outline-offset-[3px]"
        >
          <BrandLogo />
          <WordmarkText />
        </Link>
      )}

      <span className="flex-1" />

      {/*
        `nav` with an accessible name: this is the second landmark of its kind
        on the gallery (the pagination nav is the other), and two unnamed
        `nav`s are indistinguishable in a screen reader's landmark list.

        Hidden below `tablet:` (owner: "for mobile i need a hamburger menu
        which would open navigation and have those links from header rather
        than scale and move those links below logo") - `MobileNavMenu`,
        below, renders the same `NavLinks` inside its own drawer for that
        width instead.
      */}
      <nav aria-label={WORDMARK} className="hidden tablet:flex items-center gap-2 desktop:gap-10">
        <NavLinks kabinetSignedIn={kabinetSignedIn} linkClassName={NAV_LINK_CLASS} />
      </nav>

      <MobileNavMenu>
        {/* `w-full`: the drawer's own `flex flex-col` list wants full-width rows for a
            thumb-friendly tap target, unlike the horizontal `tablet:` nav above, which
            sizes each link to its own text. Composed onto `NAV_LINK_CLASS`, not a second
            copy of it, so the two stay the same font/colour/focus-ring by construction. */}
        <NavLinks
          kabinetSignedIn={kabinetSignedIn}
          linkClassName={`${NAV_LINK_CLASS} w-full`}
          testIdSuffix="-menu"
        />
      </MobileNavMenu>

      {/* Batch D: every current caller's `children` is adopter-only (the deck entry link). */}
      {!kabinetSignedIn && children}
    </header>
  );
}
