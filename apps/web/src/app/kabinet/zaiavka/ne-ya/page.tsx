import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { EmailLinkPage } from "../../../../features/kabinet/registration/EmailLinkPage";
import { kabinetEntry } from "../../signed-in-person";

export const metadata: Metadata = { title: uk.kabinet.email.applicationConfirm.notYouAction };

export default async function NotMeLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Called, not rendered: its 404 is thrown from this page itself (`available-auth.test.ts`).
  return EmailLinkPage({ purpose: "not_me", searchParams, kabinetEntry });
}
