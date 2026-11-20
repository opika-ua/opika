import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { INSTAGRAM, OPERATOR_CONTACT, WORDMARK } from "../../brand";
import { Container } from "../../ui/Container";
import { PRIVACY_PATH } from "./privacy-path";

/** MK-7, moved here from /prytulkam's body so it is shown once (owner, 2026-11-20). */
const INDEPENDENT = fillTemplate(uk.about.independent, { site: WORDMARK });

interface FooterSection {
  readonly href: string;
  readonly label: string;
  /** /tvaryny is charged to the visitor's per-IP budget (`proxy.ts`), so never prefetched. */
  readonly prefetch?: false;
}

/** In order; the privacy policy sits with the contacts, as a plain link (owner's A2 lists sections only). */
const SECTIONS: readonly FooterSection[] = [
  { href: "/tvaryny", label: uk.nav.animals, prefetch: false },
  { href: "/prytulkam", label: uk.nav.forShelters },
  { href: "/pro", label: uk.nav.about },
];

/**
 * The public site's footer (owner, 2026-11-20, concept A2): a full-width ink band with the cat and
 * dog on its top edge, under every page that wears `SiteHeader` (the signed-in kabinet has its own
 * shell, the animal overlay none). Server markup only, and in every public page's HTML: the looks
 * are single classes and the graphics static SVG files (`footer-*` in globals.css, owner 2026-11-20).
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 bg-ink">
      <Container className="relative flex flex-col gap-8 py-10 desktop:flex-row desktop:justify-between desktop:py-12">
        <div aria-hidden="true" className="footer-mascots" />
        <div className="flex max-w-80 flex-col gap-4">
          {/* Not prefetched: `/tvaryny` is charged to the visitor's per-IP budget. */}
          <Link href="/tvaryny" prefetch={false} className="footer-logo">
            <span className="sr-only">{WORDMARK}</span>
          </Link>
          <p className="footer-note">{INDEPENDENT}</p>
        </div>
        <div className="flex flex-col gap-4 desktop:items-end desktop:gap-2">
          <ul className="flex flex-col desktop:flex-row desktop:gap-9">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link
                  href={section.href}
                  {...(section.prefetch === false ? { prefetch: false } : {})}
                  className="footer-section"
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col desktop:flex-row desktop:gap-6">
            <li>
              <a href={`mailto:${OPERATOR_CONTACT.email}`} className="footer-contact footer-mail">
                {OPERATOR_CONTACT.email}
              </a>
            </li>
            <li>
              {/* The site sends only its origin cross-site (strict-origin-when-cross-origin): no `noreferrer`. */}
              <a
                href={INSTAGRAM.url}
                target="_blank"
                rel="noopener"
                className="footer-contact footer-ig"
              >
                {INSTAGRAM.label}
              </a>
            </li>
            <li>
              <Link href={PRIVACY_PATH} className="footer-link">
                {uk.privacy.title}
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
