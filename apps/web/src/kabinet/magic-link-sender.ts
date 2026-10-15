/**
 * How a magic link reaches a person (HS-Q2, Oleksii): an interface, so the
 * route doesn't know which.
 *
 * - Tests capture what would have been sent (`capturingSender`).
 * - Local dev prints the link to the server console (`consoleSender`).
 * - Production sends through the provider (`providerMagicLinkSender`, built
 *   once per process in `production-mail.ts`), and only while
 *   `productionSignInOf` is on; otherwise the sign-in route answers 503
 *   rather than pretending to send (`kabinetAuthAvailability`).
 */
/**
 * KABINET N1: a link is good for 15 minutes. Here, not in `auth.ts`, so the
 * hand-run delivery test can build the real email without loading Better
 * Auth; `auth.ts` re-exports it. The copy types the noun for 15
 * («хвилин»), pinned by `copy-plural-pins.test.ts`.
 */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

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
