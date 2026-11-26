import type { ReactNode } from "react";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/**
 * Shared shell for the static text pages («Про проєкт», «Для притулків», the privacy policy): page
 * background, the site header and footer, and a white panel (48px top radius) around the title and
 * content. One component so the pages can't drift apart.
 */
export interface ContentPageLayoutProps {
  readonly kabinetSignedIn: boolean;
  /** Which header entry this page is, for the underline; the privacy policy has none. */
  readonly current?: "about" | "forShelters";
  readonly title: ReactNode;
  readonly children: ReactNode;
}

export function ContentPageLayout({
  kabinetSignedIn,
  current,
  title,
  children,
}: ContentPageLayoutProps) {
  return (
    <div className="site-page bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} {...(current ? { current } : {})} />

      <Container as="main" className="flex-1 py-8 desktop:py-14">
        <div className="mx-auto flex max-w-180 flex-col gap-8 rounded-t-sheet bg-surface p-6 tablet:p-10 desktop:p-14">
          {/* «конфіденційності» outgrows a phone: hyphenate there. From desktop it breaks only between
              words, and the h1 may run into the right padding (the word is 629px in a 608px column). */}
          <Heading
            level={1}
            look="display-l"
            className="hyphens-auto break-words desktop:-mr-14 desktop:hyphens-manual desktop:text-display-xl"
          >
            {title}
          </Heading>
          {children}
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}
