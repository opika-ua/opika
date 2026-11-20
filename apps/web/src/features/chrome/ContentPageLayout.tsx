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
    <div className="flex min-h-dvh flex-col bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} {...(current ? { current } : {})} />

      <Container as="main" className="flex-1 py-8 desktop:py-14">
        <div className="mx-auto flex max-w-180 flex-col gap-8 rounded-t-sheet bg-surface p-6 tablet:p-10 desktop:p-14">
          {/* «конфіденційності» is wider than a 390 phone at display-l: hyphenate, else break. */}
          <Heading
            level={1}
            look="display-l"
            className="hyphens-auto break-words desktop:text-display-xl"
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
