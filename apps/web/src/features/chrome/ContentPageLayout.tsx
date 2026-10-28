import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { SiteHeader } from "./SiteHeader";

/**
 * Shared shell for the two static text pages («Про проєкт», «Для
 * притулків»): brand page background, the site header, and the pet card
 * panel look (white surface, 48px top radius) around the title and content.
 * One component so the two pages can't drift visually from each other.
 */
export interface ContentPageLayoutProps {
  readonly kabinetSignedIn: boolean;
  readonly currentPage: "pro" | "prytulkam";
  readonly title: ReactNode;
  readonly children: ReactNode;
}

export function ContentPageLayout({
  kabinetSignedIn,
  currentPage,
  title,
  children,
}: ContentPageLayoutProps) {
  return (
    <div className="font-brand-ui min-h-dvh bg-brand-page">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} />

      <div className="px-4 tablet:px-6 desktop:px-14 py-8 desktop:py-14">
        <div className="mx-auto flex max-w-[720px] flex-col gap-8 rounded-t-brand-panel-lg bg-brand-surface p-6 tablet:p-10 desktop:p-14">
          <h1 className="font-brand-display text-[34px]/[1.1] desktop:text-[48px]/[1.1] text-brand-ink">
            {title}
          </h1>
          {children}
          <Footer currentPage={currentPage} />
        </div>
      </div>
    </div>
  );
}
