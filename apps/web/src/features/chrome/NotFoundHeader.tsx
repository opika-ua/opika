import { ukPublic as uk } from "@opika/i18n/public";
import { WORDMARK } from "../../brand";
import { Container } from "../../ui/Container";
import { BrandLogo } from "./BrandLogo";

/**
 * The header of a segment's own 404. Next renders a segment's `not-found` element into that
 * segment's page payload, so the full `SiteHeader` (two nav copies, the saved island, the drawer)
 * would add about 5 KB to every animal and shelter page for a screen almost nobody sees. This one is
 * plain server markup: the logo and the same four entries as plain links, no client island.
 */
const LINK = "inline-flex min-h-target items-center text-body-l font-semibold text-ink focus-ring";

export function NotFoundHeader() {
  return (
    <header className="bg-page">
      <Container className="flex flex-wrap items-center gap-x-8 gap-y-1 py-2">
        <a href="/tvaryny" className="mr-auto inline-flex min-h-target items-center focus-ring">
          <BrandLogo />
          <span className="sr-only">{WORDMARK}</span>
        </a>
        <nav aria-label={WORDMARK} className="flex flex-wrap items-center gap-x-6">
          <a href="/tvaryny" className={LINK}>
            {uk.nav.animals}
          </a>
          <a href="/prytulkam" className={LINK}>
            {uk.nav.forShelters}
          </a>
          <a href="/pro" className={LINK}>
            {uk.nav.about}
          </a>
          <a href="/zberezheni" className={LINK}>
            {uk.nav.saved}
          </a>
        </nav>
      </Container>
    </header>
  );
}
