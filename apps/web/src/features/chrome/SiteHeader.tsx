import { ukPublic as uk } from "@opika/i18n/public";
import Link from "next/link";
import type { ReactNode } from "react";
import { WORDMARK } from "../../brand";
import { LinkButton } from "../../ui/Button";
import { Container } from "../../ui/Container";
import { Icon } from "../../ui/Icon";
import { SavedButton } from "../likes/SavedButton";
import { type Audience, audienceOf } from "./audience";
import { BrandLogo } from "./BrandLogo";
import { MobileNavMenu } from "./MobileNavMenu";

/**
 * The one header, on every user-facing surface except the deck (the deck has its own chrome and
 * "never two navigations at once"). Built from the kit: `Container` for width and gutters,
 * `Sheet` (via `MobileNavMenu`) for the hamburger drawer below `desktop:`, the token set for the
 * rest. 72px tall from desktop, 64 below; every link keeps a 48px hit area. The inline nav starts
 * at `desktop` (1024), the burger drawer below it.
 */

/** The product's name (`brand.ts`, the one constant), re-exported for the wordmark's readers. */
export { WORDMARK };

/** Which nav entry is the current page (orange underline, `aria-current`); the saved page fills the bookmark instead. */
export type NavCurrent = "animals" | "forShelters" | "about" | "saved";

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
   * Whether the kabinet session cookie is present (a UI hint, never security). A signed-in shelter
   * gets the filled «Кабінет» pill and no `children` (every current caller's is adopter-only: the
   * deck entry link); the rest of the header is the same for everyone. No default: every caller
   * decides this from its own request, via `kabinetSessionCookiePresent()`
   * (`kabinet-signed-in.ts`), so an omission cannot go unnoticed.
   */
  readonly kabinetSignedIn: boolean;
  /** The page this header is on. Omit on pages that are none of the entries. */
  readonly current?: NavCurrent;
}

/**
 * Bare text links, no pill (Figma `58:1698`): the 48px hit area is vertical (`min-h-target`) with
 * no horizontal padding, so the row's gap stays text-edge to text-edge as in the frame.
 */
const NAV_LINK_CLASS =
  "inline-flex min-h-target shrink-0 items-center whitespace-nowrap text-body-l font-semibold " +
  "text-ink transition-colors duration-(--duration-quick) hover:text-accent-text focus-ring";
/** The current page: the orange underline of the frame. */
const CURRENT_INLINE = "underline decoration-accent decoration-2 underline-offset-8";
/** In the drawer a row is full width with a hairline under it; the current one takes the accent text colour. */
const MENU_ROW_CLASS = `${NAV_LINK_CLASS} w-full border-line border-b`;
const CURRENT_ROW = "text-accent-text!";

/** `sr-only`: the logo image is decorative and already draws the word, this keeps the accessible name. */
function WordmarkText() {
  return <span className="sr-only">{WORDMARK}</span>;
}

const ENTRIES = [
  { key: "animals", href: "/tvaryny", testId: "nav-animals", label: uk.nav.animals },
  { key: "forShelters", href: "/prytulkam", testId: "nav-for-shelters", label: uk.nav.forShelters },
  { key: "about", href: "/pro", testId: "nav-about", label: uk.nav.about },
] as const;

/**
 * The nav, written once and rendered twice (inline from `desktop:`, in the drawer below it). Both
 * copies are in the DOM at once, so the drawer's links get their own ids. The saved entry is for
 * everyone and shows itself (`SavedButton`); «Кабінет» is for a signed-in shelter only, since a
 * visitor signs in from «Для притулків».
 */
function NavLinks({
  audience,
  current,
  layout,
}: {
  audience: Audience;
  current: NavCurrent | undefined;
  layout: "inline" | "menu";
}) {
  const menu = layout === "menu";
  const suffix = menu ? "-menu" : "";
  return (
    <>
      {ENTRIES.map((entry) => {
        const isCurrent = current === entry.key;
        const state = menu ? (isCurrent ? CURRENT_ROW : "") : isCurrent ? CURRENT_INLINE : "";
        return (
          <Link
            key={entry.key}
            href={entry.href}
            // Not prefetched: `/tvaryny` is charged to the visitor's per-IP budget (`proxy.ts`).
            {...(entry.key === "animals" ? { prefetch: false } : {})}
            aria-current={isCurrent ? "page" : undefined}
            data-testid={`${entry.testId}${suffix}`}
            className={`${menu ? MENU_ROW_CLASS : NAV_LINK_CLASS} ${state}`}
          >
            {entry.label}
          </Link>
        );
      })}
      {menu ? null : (
        // A visitor's separator only shows with the saved button; a shelter always has the pill.
        <span
          aria-hidden="true"
          className={`h-6 w-px shrink-0 bg-line ${audience === "visitor" ? "saved-slot" : ""}`}
        />
      )}
      <SavedButton
        layout={menu ? "row" : "button"}
        current={current === "saved"}
        testId={`nav-saved${suffix}`}
        rowClassName={`${MENU_ROW_CLASS} ${current === "saved" ? CURRENT_ROW : ""}`}
      />
      {audience === "shelter" ? (
        menu ? (
          <Link
            href="/kabinet"
            data-testid="nav-kabinet-menu"
            className={`${MENU_ROW_CLASS} justify-between`}
          >
            {uk.nav.kabinet}
            <Icon name="user" />
          </Link>
        ) : (
          <LinkButton href="/kabinet" data-testid="nav-kabinet">
            <Icon name="user" size="md" />
            {uk.nav.kabinet}
          </LinkButton>
        )
      ) : null}
    </>
  );
}

export function SiteHeader({
  children,
  wordmarkIsCurrentPage = false,
  kabinetSignedIn,
  current,
}: SiteHeaderProps) {
  const audience = audienceOf(kabinetSignedIn);
  return (
    // The element carries the sticky fill (the overlay rule in globals.css turns it transparent);
    // `Container` inside carries the width. Sticky because the header must follow the scroll.
    <header data-testid="site-header" className="sticky top-0 z-(--z-header) bg-page">
      <Container className="flex min-h-(--sticky-header-h) items-center gap-3 desktop:gap-4 py-2 tablet:py-0">
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
        <nav aria-label={WORDMARK} className="hidden desktop:flex items-center gap-8">
          <NavLinks audience={audience} current={current} layout="inline" />
        </nav>

        <MobileNavMenu>
          <NavLinks audience={audience} current={current} layout="menu" />
        </MobileNavMenu>

        {/* Every current caller's `children` is adopter-only (the deck entry link). */}
        {audience === "visitor" && children}
      </Container>
    </header>
  );
}
