import { notFound } from "next/navigation";
import {
  submitConfirmEmailLink,
  submitNotMeLink,
} from "../../../kabinet/registration/email-link-action";
import { servedRegistrationLinkOutcome } from "../../../kabinet/registration/email-link-runtime";
import { REGISTRATION_LINK_PATHS } from "../../../kabinet/registration/registration-links";
import { AuthPage } from "../AuthPage";
import { EmailLinkCard, type EmailLinkPurpose, type KabinetEntry } from "./EmailLinkCard";

const ACTIONS = { confirm_email: submitConfirmEmailLink, not_me: submitNotMeLink } as const;

/**
 * The page a confirmation-email link opens, inside the kabinet's frame. The GET only reads the
 * token (mail scanners open every link); only the card's button acts, through its server action.
 */
export async function EmailLinkPage({
  purpose,
  searchParams,
  kabinetEntry = async () => "sign_in",
}: {
  purpose: EmailLinkPurpose;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Read only once the link is known to be served, so a 404 never touches the session. */
  kabinetEntry?: () => Promise<KabinetEntry>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const outcome = await servedRegistrationLinkOutcome(purpose, { method: "GET", token });
  if (outcome.kind !== "page") notFound();
  return (
    <AuthPage>
      <EmailLinkCard
        purpose={purpose}
        initial={outcome.state}
        action={ACTIONS[purpose]}
        permalink={REGISTRATION_LINK_PATHS[purpose]}
        kabinetEntry={await kabinetEntry()}
      />
    </AuthPage>
  );
}
