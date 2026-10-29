import type { ReactNode } from "react";
import { Container } from "../../ui/Container";
import { Heading } from "../../ui/Heading";
import { SiteHeader } from "./SiteHeader";

/**
 * Shared shell for the two static text pages («Про проєкт», «Для притулків»): page background, the
 * site header, and a white panel (48px top radius) around the title and content. One component so
 * the two pages can't drift apart.
 */
export interface ContentPageLayoutProps {
  readonly kabinetSignedIn: boolean;
  readonly title: ReactNode;
  readonly children: ReactNode;
}

export function ContentPageLayout({ kabinetSignedIn, title, children }: ContentPageLayoutProps) {
  return (
    <div className="min-h-dvh bg-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      <Container className="py-8 desktop:py-14">
        <div className="mx-auto flex max-w-180 flex-col gap-8 rounded-t-sheet bg-surface p-6 tablet:p-10 desktop:p-14">
          <Heading level={1} look="display-l" className="desktop:text-display-xl">
            {title}
          </Heading>
          {children}
        </div>
      </Container>
    </div>
  );
}
