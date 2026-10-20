/**
 * How the two password emails reach a shelter admin (PW-1, §4.4): an
 * interface, as for the magic link (`MagicLinkSender`), so Better Auth's
 * callbacks don't know which.
 *
 * - Tests capture what would have been sent (`capturingPasswordMail`).
 * - Local development prints to the server console (`consolePasswordMail`):
 *   the reset link is a credential, so this is never selected in production.
 * - Production sends through the provider (`providerPasswordMail`,
 *   `email-senders.ts`), on the sign-in route, built once per process in
 *   `production-mail.ts`.
 *
 * Both are sent after the response (`deps.schedule`), so «Забули пароль?»
 * answers in the same time whatever the address, and a slow provider never
 * holds a reset or a change open.
 */
export interface PasswordMailSender {
  /** F1: the reset link, to a shelter admin's own address. */
  sendReset(message: { email: string; url: string }): Promise<void>;
  /** F2: «пароль змінено», after a reset and after a change (§9 answer 4). */
  sendChanged(message: { email: string }): Promise<void>;
}

/** RESET_PASSWORD_TTL_SECONDS: a reset link is good for one hour (Oleksii's scope item 6: "single-use token, 1h"). */
export const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

export const consolePasswordMail: PasswordMailSender = {
  async sendReset({ email, url }) {
    // Development only (`kabinetAuthAvailability`): the link is a credential.
    console.info(`[kabinet] password reset link for ${email}: ${url}`);
  },
  async sendChanged({ email }) {
    console.info(`[kabinet] password changed notice for ${email}`);
  },
};

export type CapturedPasswordMail =
  | { kind: "reset"; email: string; url: string }
  | { kind: "changed"; email: string };

export function capturingPasswordMail(): PasswordMailSender & {
  readonly sent: CapturedPasswordMail[];
} {
  const sent: CapturedPasswordMail[] = [];
  return {
    sent,
    async sendReset({ email, url }) {
      sent.push({ kind: "reset", email, url });
    },
    async sendChanged({ email }) {
      sent.push({ kind: "changed", email });
    },
  };
}
