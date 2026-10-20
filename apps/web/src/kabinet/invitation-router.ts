import { invitationContract } from "@opika/contracts";
import { kabinetInviteTokenRepo } from "@opika/db/repos";
import { implement } from "@orpc/server";
import type { KabinetContext } from "./context";
import { invitationAccepter } from "./invitation-accept";
import { acceptInvitationWithPassword } from "./invite-password";
import { resetLinkVoider } from "./password-hooks";
import { accessOrThrow } from "./router";

const base = implement(invitationContract).$context<KabinetContext>();

/** The same access matrix as the other routers, applied once per procedure. */
const guarded = base.use(async ({ context, procedure, next }) =>
  next({ context: { access: accessOrThrow(procedure, context) } }),
);

/**
 * The invitation link's «Створіть пароль» (PW-2): `acceptInvitationWithPassword`, wired to the
 * database and to Better Auth (`context.invitePasswords`, which the served route turns on). The
 * session cookie Better Auth sets on the sign-in goes out on this response, through the route's
 * `setCookies`, as support mode's cookie does.
 */
export const invitationRouter = guarded.router({
  invitation: {
    acceptWithPassword: guarded.invitation.acceptWithPassword.handler(
      async ({ context, input, errors }) => {
        if (context.access.kind !== "allow_invitation_link") {
          throw new Error(`acceptWithPassword reached with ${context.access.kind}`);
        }
        // Off only for in-process page clients, which never call this.
        if (context.invitePasswords.kind === "off") throw errors.INVITE_UNUSABLE();
        const tokens = kabinetInviteTokenRepo(context.db);
        const voidResetLinks = resetLinkVoider({
          db: context.db,
          logError: (line) => console.error(line),
        });
        const result = await acceptInvitationWithPassword(input, {
          lookup: (token) => tokens.landingOf(token),
          consume: (token, now) => tokens.consume(token, now),
          voidResetLinks: (userId) => voidResetLinks(userId, "invitation"),
          accept: invitationAccepter(context.db, () => context.now, context.newId),
          perIp: context.invitePasswords.perIp,
          ip: context.invitePasswords.ip,
          credentials: context.invitePasswords.credentials,
          now: context.now,
        });
        switch (result.kind) {
          case "signed_in":
            context.setCookies.push(...result.setCookies);
            return { kind: "signed_in" as const };
          case "password_set":
            return { kind: "password_set" as const };
          case "unusable":
            throw errors.INVITE_UNUSABLE();
          case "rejected":
            throw errors.PASSWORD_REJECTED({ data: { reason: result.reason } });
          case "rate_limited":
            throw errors.RATE_LIMITED();
          /* v8 ignore next 4 -- exists so the compiler rejects an unhandled result; unreachable at runtime */
          default: {
            const unreachable: never = result;
            return unreachable;
          }
        }
      },
    ),
  },
});

export type InvitationRouter = typeof invitationRouter;
