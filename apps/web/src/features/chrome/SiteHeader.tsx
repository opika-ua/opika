import { uk } from "@opika/i18n";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one header, on every user-facing surface except the deck.
 *
 * Phase T. Before this, three routes each carried their own near-identical
 * `<header>` and the detail page carried no wordmark at all — its own comment
 * recorded that as deliberate, reasoning the wordmark shouldn't repeat "a
 * second time on every route," while citing that mock D1 shows it. The design
 * critique found the consequence: `/tvaryny/{id}` is the URL people paste into
 * Telegram, and it arrived with no brand and no route to «Про проєкт», which
 * was itself linked from exactly one place in the whole app (the gallery
 * footer, below a ten-page grid). That is critique findings E5, E1, B2 and E7,
 * and they are one wound with one fix.
 *
 * **Not the deck.** `docs/design/README.md:589` is explicit — "the deck's
 * header *replaces* the gallery header — never two navigations at once" — and
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
 *   desktop:min-h-17` — 56/64/68px — which is critique finding A2, under the
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
 * **O-1 (`docs/observations.md`), 2026-09-10 — the mark shipped.** This file's
 * own comment used to record the mark asset as absent, "the honest half
 * rather than inventing a mark to fill a spec line." The design doc's "The
 * logo — «Поріг · Межа»" section names the geometry exactly (a 96-grid path,
 * not an image asset to source), so drawing it is following the spec, not
 * inventing one: arch `M22 70 V46 a26 26 0 0 1 52 0 v24`, threshold
 * `M14 88 h68` (both stroke 10, round caps), dot `cx=48 cy=79 r=6` (filled).
 * Ink `#101112` only (`currentColor`, via `text-rg-ink`). Lockup: 30px
 * desktop / 26px mobile.
 *
 * **Correction, 2026-09-10 — Oleksii caught the mark floating above the
 * wordmark in a real screenshot** (a rendered defect, not visible from
 * markup — exactly the class `docs/standing-constraints.md`'s "requires a
 * rendered assertion" exists for). The original lockup used `items-end`,
 * which aligns the mark's own *box* bottom to the wordmark's line-box
 * bottom — not the same point as the spec's "align optically to the
 * threshold line, not the box." Two gaps, not stacked but *net*: a CSS line
 * box extends below the true text baseline by the font's descent plus half
 * its leading (this font/size: 5px descent + 4px half-leading = 9px at
 * 26px/desktop), while the mark's own viewBox reserves 8 of its 96 units as
 * clear space *above* the box's own bottom edge, i.e. the threshold sits
 * 2.5px higher than the box bottom at 30px. 9 minus 2.5 nets the 6.5px the
 * mutated build actually measured — confirmed by measuring both in a live
 * render (canvas `measureText` against the wordmark's real computed font for
 * ascent/descent/line-height; the SVG's own client rect against the design
 * doc's stated 88/96 threshold position — not estimated from the SVG path by
 * eye). Fixed with `items-baseline` (aligns the mark's box bottom to the
 * wordmark's true typographic baseline via the browser's flex baseline
 * synthesis for a replaced element) plus `translate-y-[8.3333%]` — a
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
 * Gap to the wordmark is `gap-3` (12px) — **not** a literal rendering of
 * "the dot's own height," which the spec states in the mark's 96-unit grid
 * (a 12-unit diameter) and which scales down to ~3.75px at the 30px desktop
 * mark (~3.25px at 26px mobile) once actually rendered. That literal value
 * reads as the mark and the wordmark touching, not a deliberate gap, at
 * this lockup's real size — 12px is a practical rounding chosen for visible
 * breathing room, recorded here as a deviation rather than claimed as an
 * exact match with no mock available to check a different number against.
 * **Not built:** the 16/24px dot-dropped variant and the favicon (white mark
 * on an `#101112` rounded square) — the spec calls for both only at sizes
 * this header never renders at, and a browser favicon is a separate asset
 * pipeline (`app/icon.*`), not a header-lockup concern this observation
 * raised.
 *
 * **O-8 (`docs/observations.md`), 2026-09-10 — the `leading` slot removed.**
 * Previously existed solely for the detail page's back-link, rendered beside
 * the wordmark where it read as a site nav item rather than the page's own
 * control. Moved into `AnimalDetailScreen.tsx`'s own layout, below the
 * header — this component no longer has a `leading` prop, since nothing
 * populates it anymore. The `flex-wrap` the slot's own content used to need
 * at 360px stays — see the header element's own comment on why it's still
 * load-bearing without `leading`, for an unrelated reason (O-1's logo mark).
 */

/**
 * The product name is deliberately not in `packages/i18n`'s catalogues or in
 * `packages/domain`/`packages/contracts` — `CLAUDE.md`'s "the name is not
 * final" rule puts a brand string in app-level config, and it is identical in
 * every locale so it is not a translation unit. One constant, one file to
 * change if the name changes.
 */
const WORDMARK = "Opika";

export interface SiteHeaderProps {
  /** Surface-specific trailing actions, after the nav — the gallery's deck entry. */
  readonly children?: ReactNode;
  /**
   * Suppresses the link on the wordmark when this *is* the gallery. A link to
   * the page you are already on is a WCAG 2.4.4-adjacent annoyance and a
   * wasted Tab stop; `aria-current` on a self-link is the alternative and is
   * worse here, because the wordmark is not navigation the user is choosing
   * between.
   */
  readonly wordmarkIsCurrentPage?: boolean;
}

/**
 * `shrink-0` + `whitespace-nowrap`. Added 2026-09-12 while chasing a
 * CI-only horizontal-overflow failure at 320px, on the theory that this nav
 * caused it. **It did not** — the overflow was the gallery's own mobile
 * toolbar row (`app/tvaryny/page.tsx`), and the CI failure reproduced
 * unchanged after this landed. Corrected here rather than reverted because
 * the measurement behind it was real, even though the diagnosis was not: at
 * 320 the two labels plus their gap came to *exactly* 288.0px against
 * exactly 288px of available width, so the nav rendered with zero slack and
 * Chromium wrapped a label internally ("Для" / "притулків" stacked inside
 * one pill). That is a legibility defect on its own, but it could never
 * push the page sideways — the nav is a flex child capped at its
 * container's 288px, and measured `scrollWidth === clientWidth === 288`
 * both with and without these classes. Matches `Footer.tsx`'s own pattern
 * for the identical two-link case: the whole pill wraps to its own row
 * (`flex-wrap` on the parent `nav`, below) rather than the pill's internal
 * text wrapping.
 */
const NAV_LINK_CLASS =
  "inline-flex min-h-12 shrink-0 items-center whitespace-nowrap rounded-rg-button bg-rg-fill " +
  "px-4 text-[15px] font-medium text-rg-ink transition-colors duration-[120ms] ease-rg " +
  "hover:bg-rg-fill-strong focus-visible:outline focus-visible:outline-[3px] " +
  "focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]";

const WORDMARK_CLASS =
  "font-bold text-[22px] desktop:text-[26px] tracking-[-0.03em] text-rg-ink whitespace-nowrap";

/**
 * «Поріг · Межа» — an arch that never touches the ground, a threshold line
 * below it, a dot between them. Geometry transcribed verbatim from
 * `docs/design/README.md`'s "The logo" section; see this file's own top
 * comment (O-1) for why it's drawn rather than sourced as an image asset.
 */
function LogoMark() {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className="w-[26px] h-[26px] desktop:w-[30px] desktop:h-[30px] shrink-0 text-rg-ink translate-y-[8.3333%]"
    >
      <path
        d="M22 70 V46 a26 26 0 0 1 52 0 v24"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path d="M14 88 h68" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <circle cx="48" cy="79" r="6" fill="currentColor" />
    </svg>
  );
}

export function SiteHeader({ children, wordmarkIsCurrentPage = false }: SiteHeaderProps) {
  return (
    <header
      data-testid="site-header"
      /*
        `flex-wrap` below `tablet:` is load-bearing, not defensive — confirmed
        by a real regression, not assumed safe to drop: removing it once the
        `leading` slot's own content stopped needing it (O-8 moved that
        content out of this component entirely) broke real horizontal-scroll
        harness assertions at 360px, on both the gallery and detail pages.
        The wordmark + logo mark (O-1) + both nav pills no longer fit one row
        at 360px on their own, mark or no `leading` content — the mark's
        added ~38px (26px + 12px gap) was what tipped a row that used to fit
        exactly into one that doesn't. Above 600px everything fits on one
        line and `tablet:flex-nowrap` restores the single row the design's
        own header description assumes.
      */
      className="min-h-16 desktop:min-h-22 flex flex-wrap tablet:flex-nowrap items-center gap-3 desktop:gap-4 bg-rg-surface px-4 tablet:px-6 desktop:px-15 py-2 tablet:py-0"
    >
      {wordmarkIsCurrentPage ? (
        <span data-testid="site-wordmark" className="inline-flex items-baseline gap-3">
          <LogoMark />
          <span className={WORDMARK_CLASS}>{WORDMARK}</span>
        </span>
      ) : (
        <Link
          href="/tvaryny"
          data-testid="site-wordmark"
          className="inline-flex min-h-12 items-baseline gap-3 rounded-rg-button focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]"
        >
          <LogoMark />
          <span className={WORDMARK_CLASS}>{WORDMARK}</span>
        </Link>
      )}

      <span className="flex-1" />

      {/*
        `nav` with an accessible name: this is the second landmark of its kind
        on the gallery (the pagination nav is the other), and two unnamed
        `nav`s are indistinguishable in a screen reader's landmark list.
      */}
      <nav aria-label={WORDMARK} className="flex flex-wrap items-center gap-2 desktop:gap-3">
        <Link href="/prytulkam" data-testid="nav-for-shelters" className={NAV_LINK_CLASS}>
          {uk.nav.forShelters}
        </Link>
        <Link href="/pro" data-testid="nav-about" className={NAV_LINK_CLASS}>
          {uk.nav.about}
        </Link>
      </nav>

      {children}
    </header>
  );
}
