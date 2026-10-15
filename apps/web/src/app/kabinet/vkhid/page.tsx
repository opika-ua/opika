import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../../../api/db";
import { leavesSignIn } from "../../../features/kabinet/home";
import { InviteLandingForm } from "../../../features/kabinet/InviteLandingForm";
import { KabinetBrand } from "../../../features/kabinet/KabinetBrand";
import { SignInCard } from "../../../features/kabinet/SignInCard";
import { MAGIC_LINK_TTL_SECONDS } from "../../../kabinet/auth";
import { CREDENTIAL_PAGE_REFERRER_POLICY } from "../../../kabinet/confirm-route";
import { INVITE_LINK } from "../../../kabinet/email-links";
import { replyToAddressOf } from "../../../kabinet/email-provider";
import { kabinetIdentityOf } from "../../../kabinet/principal";
import { kabinetAuthOrNotFound } from "../available-auth";
import { sendInviteLink } from "./send-invite-link";

type SearchParams = Record<string, string | string[] | undefined>;

/** The invitation id from `?zaproshennia=`, or null when the page is plain K1. A repeated parameter is not one id. */
function invitationIdOf(params: SearchParams): string | null {
  const value = params[INVITE_LINK.param];
  return typeof value === "string" ? value : value === undefined ? null : "";
}

/** K1's route (`docs/design/KABINET.md`, "Actors and routes"), and the invite landing on the same path (IN-Q3). */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  return invitationIdOf(await searchParams) === null
    ? { title: uk.kabinet.signIn.pageTitle }
    : {
        title: uk.kabinet.inviteLanding.pageTitle,
        // The URL carries the invitation id: the button's POST then sends a
        // real Origin (checked) and a Referer of the bare origin, never the
        // id, as on the confirm page (IN-T8).
        referrer: CREDENTIAL_PAGE_REFERRER_POLICY,
      };
}

/**
 * K1 page (mock «K1 Вхід» 1440 / 360). Desktop: the brand sits on the page
 * background at padding 32, the card centred below it, bottom padding 96.
 * Phone: a white 64px header holds the brand, the card follows at padding
 * `20 16 24`.
 *
 * With `?zaproshennia=<id>` it is the invite landing instead (IN-T10,
 * EM-Q3, `kabinet/invite-landing.ts`): one button, whose POST
 * (`sendInviteLink`) sends the invited address a magic link. This GET looks
 * nothing up, charges no budget and sends nothing, and it imports nothing
 * that could (`invite-landing-get.test.ts` pins the imports). Same frame,
 * same 404 while sign-in is unavailable, same redirect home for a live
 * session.
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
  const invitationId = invitationIdOf(await searchParams);
  const card =
    invitationId === null ? (
      <SignInCard contact={contact} />
    ) : (
      <InviteLandingForm
        invitationId={invitationId}
        action={sendInviteLink}
        minutes={MAGIC_LINK_TTL_SECONDS / 60}
        contact={contact}
      />
    );
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
