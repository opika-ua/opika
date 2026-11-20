import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { INSTAGRAM, OPERATOR_CONTACT, WORDMARK } from "../../brand";
import { Container } from "../../ui/Container";
import { Icon } from "../../ui/Icon";
import { Mascot, MascotPerch } from "../../ui/Mascot";
import { BrandLogo } from "./BrandLogo";

/** MK-7, moved here from /prytulkam's body so it is shown once (owner, 2026-11-20). */
const INDEPENDENT = fillTemplate(uk.about.independent, { site: WORDMARK });

interface FooterSection {
  readonly href: string;
  readonly label: string;
  /** /tvaryny is charged to the visitor's per-IP budget (`proxy.ts`), so never prefetched. */
  readonly prefetch?: false;
}

/** In order; one entry per link, so the privacy policy joins as one line once its page exists. */
const SECTIONS: readonly FooterSection[] = [
  { href: "/tvaryny", label: uk.nav.animals, prefetch: false },
  { href: "/prytulkam", label: uk.nav.forShelters },
  { href: "/pro", label: uk.nav.about },
];

/**
 * The public site's footer (owner, 2026-11-20, concept A2): a full-width ink band with the cat and
 * dog on its top edge, under every page that wears `SiteHeader` (the signed-in kabinet has its own
 * shell, the animal overlay none). Server markup only: it is in every public page's HTML, so the
 * links' looks are single classes (`footer-*` in globals.css).
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 bg-ink">
      <Container className="relative flex flex-col gap-8 py-10 desktop:flex-row desktop:justify-between desktop:py-12">
        <MascotPerch perch="top-right" offset={32}>
          <Mascot kind="cat" pose="sit" size={64} />
          <Mascot kind="dog" pose="sit" size={64} />
        </MascotPerch>
        <div className="flex max-w-80 flex-col gap-4">
          <BrandLogo tone="light" />
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
              <a href={`mailto:${OPERATOR_CONTACT.email}`} className="footer-contact">
                <Icon name="mail" size="sm" />
                {OPERATOR_CONTACT.email}
              </a>
            </li>
            <li>
              {/* The site sends only its origin cross-site (strict-origin-when-cross-origin): no `noreferrer`. */}
              <a href={INSTAGRAM.url} target="_blank" rel="noopener" className="footer-contact">
                <Icon name="instagram" size="sm" />
                {INSTAGRAM.label}
              </a>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
