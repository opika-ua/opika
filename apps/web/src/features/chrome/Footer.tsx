import { uk } from "@opika/i18n";

/**
 * O-11 + O-13 (`docs/observations.md`), 2026-09-10 - one shared footer,
 * closing both in a single component per O-13's own instruction ("footer
 * per O-11, or /pro... a single credits location").
 *
 * No mock frame exists for a page-level footer - `docs/design/README.md`
 * has no footer/credits section at all (its own "footer" mentions are all
 * the deck's action-button row, an unrelated UI term), so this is composed
 * from what already existed rather than a spec this file is implementing.
 * Before this, `apps/web/src/app/tvaryny/page.tsx` carried a one-off
 * `<footer>` fragment - the only one in the app, present on exactly one
 * route - holding the e-Ukraine CC BY 4.0 attribution
 * (`uk.footer.fontCredit`, verbatim per that key's own doc comment; do not
 * paraphrase). That fragment is now this component, rendered on every route
 * that carries `SiteHeader` - never the deck, for the same reason it never
 * carries `SiteHeader`: `docs/design/README.md`'s "never two navigations at
 * once" (decision O-2) keeps the deck a distinct, chrome-free surface.
 *
 * **2026-10-28 (responsive audit pass):** dropped the two nav-echo links
 * («Для притулків» / «Про проєкт») this footer used to carry - both already
 * live in `SiteHeader`'s own nav, and duplicating them at the foot of the
 * page read as an accident rather than an intentional footer. The footer is
 * now just the attribution line. `currentPage` stays on the type below only
 * because `ContentPageLayout` still passes it through; it has no effect on
 * what renders.
 */

export interface FooterProps {
  /**
   * No longer used by this component (2026-10-28: both links it used to
   * suppress are gone). Kept on the type so `ContentPageLayout`'s existing
   * `<Footer currentPage={currentPage} />` call needs no matching edit for
   * what is otherwise a copy-only change.
   */
  readonly currentPage?: "pro" | "prytulkam";
}

export function Footer(_props: FooterProps) {
  return (
    <footer
      data-testid="site-footer"
      className="mt-8 flex flex-wrap items-center gap-4 text-[13px]/[18px] text-rg-ink-3"
    >
      <span>{uk.footer.fontCredit}</span>
    </footer>
  );
}
