/**
 * How a magic link reaches a person (HS-Q2, Oleksii): an interface now, a
 * provider in the invite PR. That PR picks it with a real delivery test to
 * Gmail, ukr.net and i.ua.
 *
 * - Tests capture what would have been sent (`capturingSender`).
 * - Local dev prints the link to the server console (`consoleSender`).
 * - Production has no sender in this slice, and the sign-in route answers 503
 *   rather than pretending to send (`kabinetAuthAvailability`).
 */
export interface MagicLinkSender {
  send(message: { email: string; url: string }): Promise<void>;
}

export const consoleSender: MagicLinkSender = {
  async send({ email, url }) {
    // Development only: the link is a credential, so this sender is never
    // selected when NODE_ENV is production (see `kabinetAuthAvailability`).
    console.info(`[kabinet] magic link for ${email}: ${url}`);
  },
};

export function capturingSender(): MagicLinkSender & {
  readonly sent: { email: string; url: string }[];
} {
  const sent: { email: string; url: string }[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
