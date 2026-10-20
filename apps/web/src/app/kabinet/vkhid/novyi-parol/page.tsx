import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { KabinetBrand } from "../../../../features/kabinet/KabinetBrand";
import { ResetPasswordCard } from "../../../../features/kabinet/password/ResetPasswordCard";
import { RESET_LINK } from "../../../../kabinet/email-links";
import { TOKEN_PAGE_HEADERS } from "../../../../kabinet/token-pages";
import { kabinetAvailabilityOrNotFound } from "../../available-auth";

/**
 * The URL carries the reset token, so no referrer leaves this page at all (Oleksii, 2026-10-20,
 * verbatim: "On /kabinet/vkhid* pages that carry a token: Cache-Control: no-store and
 * Referrer-Policy: no-referrer."): the header comes from the proxy (`TOKEN_PAGE_HEADERS`), this
 * is the same policy in the page itself. Unlike the confirm page's form POST (IN-T8), the form's
 * POST here is a `fetch`, which keeps its `Origin` under `no-referrer`.
 */
export const metadata: Metadata = {
  title: uk.kabinet.reset.title,
  referrer: TOKEN_PAGE_HEADERS["Referrer-Policy"],
};

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
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 items-center bg-rg-surface px-4 tablet:min-h-0 tablet:bg-transparent tablet:p-8">
        <KabinetBrand />
      </header>
      <main className="flex flex-1 flex-col px-4 pt-5 pb-6 tablet:items-center tablet:justify-center tablet:px-8 tablet:pt-8 tablet:pb-24">
        <ResetPasswordCard token={token} />
      </main>
    </div>
  );
}
