import { uk } from "@opika/i18n";
import { AuthCardFooter } from "../../ui/AuthCardFooter";
import { isSelfRegistrationEnabled } from "./flag";
import { REGISTRATION_ANCHOR } from "./form-state";

/**
 * «Ще немає кабінету? Зареєструйте притулок»: the sign-in card's footer strip, a full load to the
 * form on /prytulkam. Nothing while self-registration is off.
 */
export function RegistrationSignInPrompt({
  enabled = isSelfRegistrationEnabled(),
}: {
  enabled?: boolean;
}) {
  if (!enabled) return null;
  return (
    <AuthCardFooter
      text={uk.registration.signInPrompt.text}
      linkLabel={uk.registration.signInPrompt.link}
      href={`/prytulkam#${REGISTRATION_ANCHOR}`}
    />
  );
}
