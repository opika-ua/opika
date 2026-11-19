import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { EmailLinkPage } from "../../../../features/kabinet/registration/EmailLinkPage";

export const metadata: Metadata = { title: uk.kabinet.email.applicationConfirm.action };

export default async function ConfirmEmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Called, not rendered: its 404 is thrown from this page itself (`available-auth.test.ts`).
  return EmailLinkPage({ purpose: "confirm_email", searchParams });
}
