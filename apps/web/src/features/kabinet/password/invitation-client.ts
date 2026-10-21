import { invitationContract } from "@opika/contracts";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { PASSWORD_REFUSAL_CODES, type PasswordRefusal } from "../../../kabinet/password-codes";

/**
 * The browser's one call on the invitation link's page (PW-2): `invitation.acceptWithPassword`,
 * the contract's own object, so its `invitation_link` access meta comes with it. Same origin, so
 * the kabinet route's Origin check applies; under the page's `no-referrer` a `fetch` still sends
 * its real Origin (the harness checks it in Chromium).
 */
const browserContract = {
  invitation: { acceptWithPassword: invitationContract.invitation.acceptWithPassword },
} as const;

type InvitationClient = ContractRouterClient<typeof browserContract>;

const link = new RPCLink<Record<never, never>>({
  url: () => `${window.location.origin}/api/kabinet`,
});

const client: InvitationClient = createORPCClient(link);

/** What the form makes of the POST's answer; each kind is one of his sentences or a navigation. */
export type SetPasswordOutcome =
  | { kind: "signed_in" }
  /** Set, but not signed in (the sign-in delay or a budget): the person signs in by hand. */
  | { kind: "password_set" }
  | { kind: "unusable" }
  | { kind: "refused"; refusal: PasswordRefusal }
  | { kind: "throttled" }
  /** No answer, or a server error. */
  | { kind: "failed" };

/** The answer, read from oRPC's error code and data only, never a message. */
export function setPasswordOutcomeOf(
  answer: { kind: "signed_in" | "password_set" } | unknown,
  failed: boolean,
): SetPasswordOutcome {
  if (!failed) {
    const kind = (answer as { kind?: unknown } | null)?.kind;
    return kind === "signed_in" || kind === "password_set" ? { kind } : { kind: "failed" };
  }
  if (!(answer instanceof ORPCError)) return { kind: "failed" };
  switch (answer.code) {
    case "INVITE_UNUSABLE":
      return { kind: "unusable" };
    case "RATE_LIMITED":
      return { kind: "throttled" };
    case "PASSWORD_REJECTED": {
      // The contract's reasons are the refusals' own names.
      const reason = (answer.data as { reason?: unknown } | undefined)?.reason;
      return typeof reason === "string" && Object.hasOwn(PASSWORD_REFUSAL_CODES, reason)
        ? { kind: "refused", refusal: reason as PasswordRefusal }
        : { kind: "failed" };
    }
    default:
      return { kind: "failed" };
  }
}

export async function acceptWithPassword(
  token: string,
  password: string,
): Promise<SetPasswordOutcome> {
  try {
    return setPasswordOutcomeOf(
      await client.invitation.acceptWithPassword({ token, password }),
      false,
    );
  } catch (error) {
    return setPasswordOutcomeOf(error, true);
  }
}
