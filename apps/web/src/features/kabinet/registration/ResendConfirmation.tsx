import { changeLoginEmail } from "../../../kabinet/registration/change-login-email-action";
import { resendConfirmationEmail } from "../../../kabinet/registration/resend-confirmation-action";
import { ConfirmEmailActions } from "./ConfirmEmailActions";

/** The «Підтвердіть email» banner's actions with their server actions bound. */
export function ResendConfirmation() {
  return <ConfirmEmailActions resend={resendConfirmationEmail} change={changeLoginEmail} />;
}
