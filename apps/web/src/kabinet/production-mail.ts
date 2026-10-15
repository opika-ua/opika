import {
  blockedStatusOf,
  cachedBlockList,
  type EmailProviderConfig,
  fetchEmailSender,
} from "./email-provider";
import {
  type InvitationSender,
  type ProviderMail,
  providerInvitationSender,
  providerMagicLinkSender,
} from "./email-senders";
import { MAGIC_LINK_TTL_SECONDS, type MagicLinkSender } from "./magic-link-sender";
import type { ProductionSignIn } from "./production-sign-in";

/**
 * Production's two emails, built from `productionSignInOf`'s "on" result
 * (`docs/h2-next-prs.md`, the wiring item; EM-T22, EM-T18):
 *
 * - the magic link goes through `routes.signIn`, signed with the configured
 *   operator name (`ProductionSignIn.operatorName`, the value that signs the
 *   invite);
 * - the invite goes through `routes.invite`, and so does the registry's
 *   blocked-addresses view (`cachedBlockList`). On Resend both block checks
 *   answer `unknown` (`provider_suppresses`, EM-T26) until EM-F1.
 *
 * Every email still holding `[COPY PENDING]` is refused, never sent (IN-Q5),
 * on top of the copy gate that keeps sign-in off while any is pending.
 */
export type ProductionMail = { sender: MagicLinkSender; invites: InvitationSender };

type Deps = {
  /** Injectable so a test can see which provider each email reaches; production uses `fetch`. */
  fetchImpl?: typeof fetch;
  /** Where a sign-in send's masked failure line goes (IN-E7); production uses `console.warn`. */
  log?: (line: string) => void;
};

const providerMailOf = (config: EmailProviderConfig, fetchImpl: typeof fetch): ProviderMail => ({
  sender: fetchEmailSender(config, fetchImpl),
  blockedStatus: (address) => blockedStatusOf(config, address, fetchImpl),
  refuseCopyPending: true,
});

/** Pure: a fresh pair of senders for one configuration. `productionMailFor` is the per-process one. */
export function productionMailOf(
  on: Extract<ProductionSignIn, { kind: "on" }>,
  deps: Deps = {},
): ProductionMail {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? ((line: string) => console.warn(line));
  return {
    sender: providerMagicLinkSender(providerMailOf(on.email.signIn, fetchImpl), {
      ttlMinutes: MAGIC_LINK_TTL_SECONDS / 60,
      operatorName: on.operatorName,
      log,
    }),
    invites: providerInvitationSender(providerMailOf(on.email.invite, fetchImpl), {
      fromAddress: on.email.invite.fromAddress,
      blockList: cachedBlockList(on.email.invite, { fetchImpl }),
    }),
  };
}

/**
 * Built once per process and reused by every request, so the block list's
 * three-minute cache (`cachedBlockList`) is shared rather than rebuilt and
 * thrown away per request. Rebuilt only if the configuration itself differs
 * (never in a deployed instance, whose environment is fixed; it keeps a test
 * that changes the environment from reading a stale pair). The key holds the
 * provider keys in memory only, as `process.env` already does; it is never
 * logged.
 */
let cached: { key: string; mail: ProductionMail } | undefined;

export function productionMailFor(on: Extract<ProductionSignIn, { kind: "on" }>): ProductionMail {
  const key = JSON.stringify([on.email, on.operatorName]);
  if (cached?.key !== key) cached = { key, mail: productionMailOf(on) };
  return cached.mail;
}
