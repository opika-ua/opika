import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { EmailLinkPage } from "../../../../features/kabinet/registration/EmailLinkPage";

export const metadata: Metadata = { title: uk.kabinet.email.applicationConfirm.notYouAction };

export default function NotMeLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <EmailLinkPage purpose="not_me" searchParams={searchParams} />;
}
