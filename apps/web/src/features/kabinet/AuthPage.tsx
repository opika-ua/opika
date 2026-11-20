import type { ReactNode } from "react";
import { Container } from "../../ui/Container";
import { SiteHeader } from "../chrome/SiteHeader";

/**
 * The frame of every page before sign-in (sign-in and invitation landing, forgot, new password,
 * the registration email's links): the public site header with «Кабінет притулку» as the current
 * section (owner, 2026-11-20, option A), then one card, centred from tablet, full width on a phone.
 * The kabinet shell is for signed-in pages only.
 */
export function AuthPage({
  kabinetSignedIn,
  children,
}: {
  /** As every public page passes it: `kabinetSessionCookiePresent()`. */
  kabinetSignedIn: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader kabinetSignedIn={kabinetSignedIn} current="kabinet" />
      <Container
        as="main"
        className="flex flex-1 flex-col pt-6 pb-6 tablet:items-center tablet:justify-center tablet:pt-8 tablet:pb-24"
      >
        {children}
      </Container>
    </div>
  );
}
