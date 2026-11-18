import { uk } from "@opika/i18n";
import { TextLink } from "../../ui/TextLink";
import { isSelfRegistrationEnabled } from "./flag";
import { REGISTRATION_ANCHOR } from "./form-state";

/**
 * «Ще немає кабінету? Зареєструйте притулок» under the sign-in form (§13.1), for a shelter that
 * landed on sign-in with no kabinet yet. Nothing while self-registration is off.
 */
export function RegistrationSignInPrompt({
  enabled = isSelfRegistrationEnabled(),
}: {
  enabled?: boolean;
}) {
  if (!enabled) return null;
  return (
    <TextLink
      href={`/prytulkam#${REGISTRATION_ANCHOR}`}
      placement="standalone"
      className="mt-4 self-center"
    >
      {uk.registration.signInPrompt}
    </TextLink>
  );
}
