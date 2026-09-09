import { uk } from "@opika/i18n";
import Link from "next/link";

/**
 * O-11 + O-13 (`docs/observations.md`), 2026-09-10 — one shared footer,
 * closing both in a single component per O-13's own instruction ("footer
 * per O-11, or /pro... a single credits location").
 *
 * No mock frame exists for a page-level footer — `docs/design/README.md`
 * has no footer/credits section at all (its own "footer" mentions are all
 * the deck's action-button row, an unrelated UI term), so this is composed
 * from what already existed rather than a spec this file is implementing.
 * Before this, `apps/web/src/app/tvaryny/page.tsx` carried a one-off
 * `<footer>` fragment — the only one in the app, present on exactly one
 * route — holding the e-Ukraine CC BY 4.0 attribution
 * (`uk.footer.fontCredit`, verbatim per that key's own doc comment; do not
 * paraphrase) and a link to `/pro`. That fragment is now this component,
 * rendered on every route that carries `SiteHeader` (gallery, `/pro`,
 * `/prytulkam`, animal detail) — never the deck, for the same reason it
 * never carries `SiteHeader`: `docs/design/README.md`'s "never two
 * navigations at once" (decision O-2) keeps the deck a distinct, chrome-free
 * surface.
 *
 * The second link (`uk.nav.forShelters`) is new *placement*, not new copy —
 * both links already exist verbatim in `SiteHeader`'s own nav; echoing them
 * at the foot of a long page (the gallery's ten-page grid is the case that
 * motivated `SiteHeader` reaching `/pro` from the header in the first place)
 * is the "secondary links" half of O-11's own wording, built from strings
 * already signed off rather than inventing footer-specific copy.
 */

const FOOTER_LINK_CLASS =
  "shrink-0 underline focus-visible:outline focus-visible:outline-[3px] " +
  "focus-visible:outline-rg-registry focus-visible:outline-offset-[3px] rounded-rg-button";

export interface FooterProps {
  /**
   * Suppresses the matching link when the footer renders on the page it
   * would point at — the same self-link redundancy `SiteHeader`'s
   * `wordmarkIsCurrentPage` exists to avoid, applied to `/pro` and
   * `/prytulkam` specifically, the two pages this footer would otherwise
   * link to itself.
   */
  readonly currentPage?: "pro" | "prytulkam";
}

export function Footer({ currentPage }: FooterProps = {}) {
  return (
    <footer
      data-testid="site-footer"
      className="mt-8 flex flex-wrap items-center gap-4 text-[13px]/[18px] text-rg-ink-3"
    >
      <span>{uk.footer.fontCredit}</span>
      {currentPage !== "prytulkam" && (
        <Link href="/prytulkam" className={FOOTER_LINK_CLASS}>
          {uk.nav.forShelters}
        </Link>
      )}
      {currentPage !== "pro" && (
        <Link href="/pro" className={FOOTER_LINK_CLASS}>
          {uk.nav.about}
        </Link>
      )}
    </footer>
  );
}
