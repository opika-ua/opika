import { notFound } from "next/navigation";
import {
  submitConfirmEmailLink,
  submitNotMeLink,
} from "../../../kabinet/registration/email-link-action";
import { servedRegistrationLinkOutcome } from "../../../kabinet/registration/email-link-runtime";
import { REGISTRATION_LINK_PATHS } from "../../../kabinet/registration/registration-links";
import { kabinetSessionCookiePresent } from "../../chrome/kabinet-signed-in";
import { AuthPage } from "../AuthPage";
import { EmailLinkCard, type EmailLinkPurpose, type KabinetEntry } from "./EmailLinkCard";

const ACTIONS = { confirm_email: submitConfirmEmailLink, not_me: submitNotMeLink } as const;

/**
 * The page a confirmation-email link opens, in the pre-sign-in frame. The GET only reads the
 * token (mail scanners open every link); only the card's button acts, through its server action.
 */
export async function EmailLinkPage({
  purpose,
  searchParams,
  kabinetEntry,
}: {
  purpose: EmailLinkPurpose;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /**
   * The session read for the confirmed card's button: called only on a served confirm link, so a
   * 404 and «Це не я» (which never shows that card) leave the session untouched.
   */
  kabinetEntry: () => Promise<KabinetEntry>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const outcome = await servedRegistrationLinkOutcome(purpose, { method: "GET", token });
  if (outcome.kind !== "page") notFound();
  return (
    <AuthPage kabinetSignedIn={await kabinetSessionCookiePresent()}>
      <EmailLinkCard
        purpose={purpose}
        initial={outcome.state}
        action={ACTIONS[purpose]}
        permalink={REGISTRATION_LINK_PATHS[purpose]}
        kabinetEntry={purpose === "confirm_email" ? await kabinetEntry() : "sign_in"}
      />
    </AuthPage>
  );
}
