import { uk } from "@opika/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { WORDMARK } from "../../brand";
import { Container } from "../../ui/Container";
import { SavedNavLink } from "../likes/SavedNavLink";
import { BrandLogo } from "./BrandLogo";
import { MobileNavMenu } from "./MobileNavMenu";

/**
 * The one header, on every user-facing surface except the deck (the deck has its own chrome and
 * "never two navigations at once"). Built from the kit: `Container` for width and gutters,
 * `Sheet` (via `MobileNavMenu`) for the hamburger drawer below `tablet:`, the token set for the
 * rest. 72px tall from desktop, 64 below; every link keeps a 48px hit area.
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
 * Bare text links, no pill (Figma `58:1698`): the 48px hit area is vertical (`min-h-target`) with
 * no horizontal padding, so the row's gap stays text-edge to text-edge as in the frame.
 */
const NAV_LINK_CLASS =
  "inline-flex min-h-target shrink-0 items-center whitespace-nowrap text-body-l font-semibold " +
  "text-ink transition-colors duration-(--duration-quick) hover:text-accent-text focus-ring";

/** `sr-only`: the logo image is decorative and already draws the word, this keeps the accessible name. */
function WordmarkText() {
  return <span className="sr-only">{WORDMARK}</span>;
}

/**
 * The nav links, written once and rendered twice (inline from `tablet:`, in the drawer below it).
 * Both copies are in the DOM at once, so `testIdSuffix` gives the drawer's links their own ids.
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
        // «Збережені» shows only while something is saved.
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
    // The element carries the sticky fill (the overlay rule in globals.css turns it transparent);
    // `Container` inside carries the width. Sticky because the header must follow the scroll.
    <header data-testid="site-header" className="sticky top-0 z-(--z-header) bg-page">
      <Container className="flex min-h-16 desktop:min-h-18 items-center gap-3 desktop:gap-4 py-2 tablet:py-0">
        {wordmarkIsCurrentPage ? (
          <span data-testid="site-wordmark" className="inline-flex items-center">
            <BrandLogo />
            <WordmarkText />
          </span>
        ) : (
          // Not prefetched: `/tvaryny` is charged to the visitor's per-IP budget (`proxy.ts`).
          <Link
            href="/tvaryny"
            prefetch={false}
            data-testid="site-wordmark"
            className="inline-flex min-h-target items-center rounded-field focus-ring"
          >
            <BrandLogo />
            <WordmarkText />
          </Link>
        )}

        <span className="flex-1" />

        {/* Named, because the pagination nav is the other landmark of its kind on the gallery. */}
        <nav aria-label={WORDMARK} className="hidden tablet:flex items-center gap-2 desktop:gap-10">
          <NavLinks kabinetSignedIn={kabinetSignedIn} linkClassName={NAV_LINK_CLASS} />
        </nav>

        <MobileNavMenu>
          {/* `w-full`: full-width rows for a thumb-friendly tap target in the drawer. */}
          <NavLinks
            kabinetSignedIn={kabinetSignedIn}
            linkClassName={`${NAV_LINK_CLASS} w-full`}
            testIdSuffix="-menu"
          />
        </MobileNavMenu>

        {/* Every current caller's `children` is adopter-only (the deck entry link). */}
        {!kabinetSignedIn && children}
      </Container>
    </header>
  );
}
