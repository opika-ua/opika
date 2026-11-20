import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { kabinetSessionCookiePresent } from "../../../../features/chrome/kabinet-signed-in";
import { AuthPage } from "../../../../features/kabinet/AuthPage";
import { ResetPasswordCard } from "../../../../features/kabinet/password/ResetPasswordCard";
import { RESET_LINK } from "../../../../kabinet/email-links";
import { kabinetAvailabilityOrNotFound } from "../../available-auth";

/** No `referrer` here: next.config's `strict-origin` header (all of /kabinet, owner 2026-11-16) is the only policy. */
export const metadata: Metadata = { title: uk.kabinet.reset.title };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The reset link's page (PW-1, §4.1): `/kabinet/vkhid/novyi-parol?token=…`.
 * The GET only shows the form: it looks nothing up and consumes nothing, so a
 * mail scanner opening the link leaves it usable. Once loaded, the card takes
 * the token out of the address bar and keeps it in the form's hidden field. The token is used up only
 * by the form's POST, through Better Auth's `/reset-password`. A repeated or
 * missing parameter is an empty token, which that POST refuses as invalid.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  kabinetAvailabilityOrNotFound();
  const value = (await searchParams)[RESET_LINK.param];
  const token = typeof value === "string" ? value : "";
  return (
    <AuthPage kabinetSignedIn={await kabinetSessionCookiePresent()}>
      <ResetPasswordCard token={token} />
    </AuthPage>
  );
}
