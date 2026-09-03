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
 * - **The mark is absent.** The spec's lockup is "mark 30px + wordmark"; this
 *   repo has no mark asset (nothing in `apps/web/public/` but seed photos).
 *   Shipping the wordmark alone is the honest half rather than inventing a
 *   mark to fill a spec line — recorded so the gap is visible, not silently
 *   satisfied.
 *
 * The city chip and «Мої запити · N» remain absent for the same reason they
 * always were: My Reveals and i18n are later phases. Unchanged by this one.
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
  /**
   * Surface-specific chrome that sits between the wordmark and the nav — the
   * detail page's «← До списку», for instance. Rendered before the spacer so
   * it reads as belonging to the current page rather than to the site.
   */
  readonly leading?: ReactNode;
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

const NAV_LINK_CLASS =
  "inline-flex min-h-12 items-center rounded-rg-button bg-rg-fill px-4 text-[15px] font-medium " +
  "text-rg-ink transition-colors duration-[120ms] ease-rg hover:bg-rg-fill-strong " +
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry " +
  "focus-visible:outline-offset-[3px]";

const WORDMARK_CLASS =
  "font-bold text-[22px] desktop:text-[26px] tracking-[-0.03em] text-rg-ink whitespace-nowrap";

export function SiteHeader({ leading, children, wordmarkIsCurrentPage = false }: SiteHeaderProps) {
  return (
    <header
      data-testid="site-header"
      /*
        `flex-wrap` below `tablet:` is load-bearing, not defensive. On the
        detail page at 360px the row is wordmark + «← До списку» + two nav
        links, which measures wider than the 328px content column and would
        scroll the page sideways — the exact failure
        `expectNoHorizontalOverflow` exists to catch. Above 600px everything
        fits on one line and `tablet:flex-nowrap` restores the single row the
        design's own header description assumes.
      */
      className="min-h-16 desktop:min-h-22 flex flex-wrap tablet:flex-nowrap items-center gap-3 desktop:gap-4 bg-rg-surface px-4 tablet:px-6 desktop:px-15 py-2 tablet:py-0"
    >
      {wordmarkIsCurrentPage ? (
        <span data-testid="site-wordmark" className={WORDMARK_CLASS}>
          {WORDMARK}
        </span>
      ) : (
        <Link
          href="/tvaryny"
          data-testid="site-wordmark"
          className={`${WORDMARK_CLASS} inline-flex min-h-12 items-center rounded-rg-button focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-rg-registry focus-visible:outline-offset-[3px]`}
        >
          {WORDMARK}
        </Link>
      )}

      {/*
        Ordered last and given the full row on phones so the wrap above puts
        the *page's* control on its own line rather than orphaning a nav link
        — the wordmark and site nav stay together as one recognisable row.
      */}
      {leading ? (
        <div className="order-last w-full tablet:order-none tablet:w-auto flex items-center gap-3">
          {leading}
        </div>
      ) : null}

      <span className="flex-1" />

      {/*
        `nav` with an accessible name: this is the second landmark of its kind
        on the gallery (the pagination nav is the other), and two unnamed
        `nav`s are indistinguishable in a screen reader's landmark list.
      */}
      <nav aria-label={WORDMARK} className="flex items-center gap-2 desktop:gap-3">
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
