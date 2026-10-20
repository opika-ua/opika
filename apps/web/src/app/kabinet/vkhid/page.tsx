import { kabinetInviteTokenRepo } from "@opika/db/repos";
import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../../../api/db";
import { leavesSignIn } from "../../../features/kabinet/home";
import { KabinetBrand } from "../../../features/kabinet/KabinetBrand";
import { InviteUnusableCard } from "../../../features/kabinet/password/InviteUnusableCard";
import { SetPasswordCard } from "../../../features/kabinet/password/SetPasswordCard";
import { SignInCard } from "../../../features/kabinet/SignInCard";
import { INVITE_LINK } from "../../../kabinet/email-links";
import { replyToAddressOf } from "../../../kabinet/email-provider";
import { invitePasswordLandingOf } from "../../../kabinet/invite-password";
import { kabinetIdentityOf } from "../../../kabinet/principal";
import { TOKEN_PAGE_HEADERS } from "../../../kabinet/token-pages";
import { kabinetAuthOrNotFound } from "../available-auth";

type SearchParams = Record<string, string | string[] | undefined>;

/** The link's token from `?zaproshennia=`, or null when the page is plain K1. A repeated parameter is not one token. */
function inviteTokenOf(params: SearchParams): string | null {
  const value = params[INVITE_LINK.param];
  return typeof value === "string" ? value : value === undefined ? null : "";
}

/** K1's route (`docs/design/KABINET.md`, "Actors and routes"), and the invite landing on the same path (IN-Q3). */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  return inviteTokenOf(await searchParams) === null
    ? { title: uk.kabinet.signIn.pageTitle }
    : {
        title: uk.kabinet.inviteLanding.pageTitle,
        // The URL carries the link's token: no referrer leaves the page (his PW-2 Q1: "Token
        // pages send Cache-Control: no-store, plus Referrer-Policy: no-referrer, except that
        // pages whose button submits an ordinary form use strict-origin"). The form's POST is a
        // `fetch`, which keeps its real Origin under `no-referrer`, so this page is not the
        // exception. The proxy sends the same policy as a header (`TOKEN_PAGE_HEADERS`).
        referrer: TOKEN_PAGE_HEADERS["Referrer-Policy"],
      };
}

/**
 * K1 page (mock «K1 Вхід» 1440 / 360). Desktop: the brand sits on the page
 * background at padding 32, the card centred below it, bottom padding 96.
 * Phone: a white 64px header holds the brand, the card follows at padding
 * `20 16 24`.
 *
 * With `?zaproshennia=<token>` it is the invitation link's «Створіть пароль» instead (PW-2,
 * `kabinet/invite-password.ts`): one read of the invitation the token names, by its hash, and
 * either the form (the shelter and the address, masked) or the one unusable page. The GET
 * consumes nothing, charges no budget and sends nothing (his PW-2 Q1; `invite-landing-get.test.ts`
 * opens it twice and compares the database). Same frame, same 404 while sign-in is unavailable,
 * same redirect home for a live session.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // A live session goes home instead of sitting on a form that looks signed
  // out (review of #93, finding 1). While sign-in is unavailable this page
  // answers its own 404 before touching auth or the database.
  const auth = kabinetAuthOrNotFound();
  const requestHeaders = new Headers(await headers());
  const now = new Date();
  const identity = await kabinetIdentityOf(
    auth,
    getDb(),
    requestHeaders,
    now,
    process.env.NODE_ENV === "production",
  );
  if (leavesSignIn(identity.principal)) redirect("/kabinet");
  const contact = replyToAddressOf(process.env.EMAIL_REPLY_TO);
  const token = inviteTokenOf(await searchParams);
  let card: React.ReactNode;
  if (token === null) {
    card = <SignInCard contact={contact} />;
  } else {
    const landing = await invitePasswordLandingOf(token, {
      lookup: (value) => kabinetInviteTokenRepo(getDb()).landingOf(value),
      now,
    });
    card =
      landing.kind === "form" ? (
        <SetPasswordCard
          token={token}
          shelterName={landing.shelterName}
          maskedEmail={landing.maskedEmail}
        />
      ) : (
        <InviteUnusableCard />
      );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 items-center bg-rg-surface px-4 tablet:min-h-0 tablet:bg-transparent tablet:p-8">
        <KabinetBrand />
      </header>
      <main className="flex flex-1 flex-col px-4 pt-5 pb-6 tablet:items-center tablet:justify-center tablet:px-8 tablet:pt-8 tablet:pb-24">
        {card}
      </main>
    </div>
  );
}
