import { resendConfirmationEmail } from "../../../kabinet/registration/resend-confirmation-action";
import { ResendConfirmationButton } from "./ResendConfirmationButton";

/** The resend button with its server action bound, for the «Підтвердіть email» banner. */
export function ResendConfirmation() {
  return <ResendConfirmationButton action={resendConfirmationEmail} />;
}
