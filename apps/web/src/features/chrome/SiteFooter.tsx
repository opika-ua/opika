import { fillTemplate, uk } from "@opika/i18n";
import Link from "next/link";
import { INSTAGRAM, OPERATOR_CONTACT, WORDMARK } from "../../brand";
import { Container } from "../../ui/Container";
import { InlineList } from "../../ui/InlineList";
import { Text } from "../../ui/Text";
import { isSelfRegistrationEnabled } from "../registration/flag";
import { RULES_HREF } from "../registration/form-state";

/** MK-7, moved here from /prytulkam's body so it is shown once (owner, 2026-11-20). */
const INDEPENDENT = fillTemplate(uk.about.independent, { site: WORDMARK });

interface FooterLink {
  readonly href: string;
  readonly label: string;
  /** /tvaryny is charged to the visitor's per-IP budget (`proxy.ts`), so never prefetched. */
  readonly prefetch?: false;
  /** /prytulkam has its «Правила» section only while self-registration is on. */
  readonly needsSelfRegistration?: true;
}

/** In order; one entry per link, so the privacy policy joins as one line once its page exists. */
const LINKS: readonly FooterLink[] = [
  { href: "/tvaryny", label: uk.nav.animals, prefetch: false },
  { href: "/prytulkam", label: uk.nav.forShelters },
  { href: "/pro", label: uk.nav.about },
  { href: RULES_HREF, label: uk.registration.page.jump.rules, needsSelfRegistration: true },
];

/**
 * The public site's footer, under every page that wears `SiteHeader` (the signed-in kabinet has its
 * own shell). Server markup only: it is in every public page's HTML, hence `footer-link`.
 */
export function SiteFooter() {
  const selfRegistration = isSelfRegistrationEnabled();
  const links = LINKS.filter((link) => selfRegistration || !link.needsSelfRegistration);
  return (
    <footer className="mt-auto border-line border-t">
      <Container className="flex flex-col gap-2 py-6 desktop:flex-row desktop:flex-wrap desktop:justify-between">
        <InlineList
          itemWrap="never"
          items={links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              {...(link.prefetch === false ? { prefetch: false } : {})}
              className="footer-link"
            >
              {link.label}
            </Link>
          ))}
        />
        <InlineList
          itemWrap="never"
          items={[
            <a key="email" href={`mailto:${OPERATOR_CONTACT.email}`} className="footer-link">
              {OPERATOR_CONTACT.email}
            </a>,
            // The site sends only its origin cross-site (strict-origin-when-cross-origin): no `noreferrer`.
            <a key="ig" href={INSTAGRAM.url} target="_blank" rel="noopener" className="footer-link">
              {INSTAGRAM.label}
            </a>,
          ]}
        />
        <Text look="hint" className="desktop:basis-full">
          {INDEPENDENT}
        </Text>
      </Container>
    </footer>
  );
}
