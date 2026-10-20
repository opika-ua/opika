import { uk } from "@opika/i18n";
import type { Metadata } from "next";
import { KabinetBrand } from "../../../../features/kabinet/KabinetBrand";
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
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-16 items-center bg-rg-surface px-4 tablet:min-h-0 tablet:bg-transparent tablet:p-8">
        <KabinetBrand />
      </header>
      <main className="flex flex-1 flex-col px-4 pt-5 pb-6 tablet:items-center tablet:justify-center tablet:px-8 tablet:pt-8 tablet:pb-24">
        <ForgotPasswordCard minutes={RESET_PASSWORD_TTL_SECONDS / 60} />
      </main>
    </div>
  );
}
