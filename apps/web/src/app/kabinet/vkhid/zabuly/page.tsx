import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { AuthPage } from "../../../../features/kabinet/AuthPage";
import { ForgotPasswordCard } from "../../../../features/kabinet/password/ForgotPasswordCard";
import { RESET_PASSWORD_TTL_SECONDS } from "../../../../kabinet/password-mail";
import { kabinetAvailabilityOrNotFound } from "../../available-auth";

export const metadata: Metadata = { title: uk.kabinet.forgot.title };

/**
 * «Забули пароль?» (PW-1, §4.2). The GET looks nothing up and touches
 * nothing; the form's POST goes to Better Auth's `/request-password-reset`
 * through the kabinet's auth route. A signed-in admin can reach it too (from
 * «Змінити пароль»'s note), so it never redirects home. While sign-in is
 * unavailable it answers its own 404, like every kabinet page.
 */
export default function ForgotPasswordPage() {
  kabinetAvailabilityOrNotFound();
  return (
    <AuthPage>
      <ForgotPasswordCard minutes={RESET_PASSWORD_TTL_SECONDS / 60} />
    </AuthPage>
  );
}
