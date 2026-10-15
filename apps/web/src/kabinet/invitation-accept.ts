import type { Database } from "@opika/db";
import { type InvitationAcceptResult, kabinetInvitationAcceptRepo } from "@opika/db/repos";
import type { KabinetIdentity } from "./principal";

/**
 * The automatic invitation accept, as the app sees it (IN-Q12, Oleksii):
 * Better Auth signs the person in as normal, then this accepts a pending,
 * unexpired invitation for their address, in one statement (the repo). It
 * runs after every successful «Увійти» (`confirm-route.ts`) and wherever
 * `/kabinet` resolves a signed-in user with no role (`selfHealingIdentity`),
 * so an accept that failed once completes on the next sign-in or load.
 *
 * The user is always the session's, never anything the client sent.
 */
export type InvitationAcceptOutcome =
  | InvitationAcceptResult
  /**
   * The statement failed (connection, an id collision): nothing was written
   * and the invitation is still pending. The person stays signed in and is
   * told, with a retry (IN-Q12: "Never a 500, never silent").
   */
  | { kind: "failed" };

export type AcceptInvitation = (userId: string) => Promise<InvitationAcceptOutcome>;

export function invitationAccepter(
  db: Database,
  now: () => Date,
  newId: () => string = () => crypto.randomUUID(),
): AcceptInvitation {
  return async (userId) => {
    try {
      return await kabinetInvitationAcceptRepo(db).accept({
        userId,
        now: now(),
        ids: { memberId: newId(), historyId: newId() },
      });
    } catch (error) {
      // The code only: a query error's message carries its parameters, the
      // invitee's address among them, and that never goes to a log.
      const code = (error as { cause?: { code?: unknown }; code?: unknown }).cause?.code;
      console.error(
        `[kabinet] invitation accept failed${typeof code === "string" ? ` (${code})` : ""}; the invitation stays pending`,
      );
      return { kind: "failed" };
    }
  };
}

/** `/kabinet`'s identity after the self-healing accept. */
export type HealedIdentity =
  | { kind: "resolved"; identity: KabinetIdentity }
  /** Signed in, with a pending invitation that couldn't be completed this time. */
  | { kind: "join_failed" };

/**
 * A signed-in user with no role may be holding a pending invitation whose
 * accept failed on sign-in: accept it now, then resolve them again, so the
 * page they land on is the shelter they just joined. Anyone else passes
 * through untouched, with no write.
 */
export async function selfHealingIdentity(
  identity: KabinetIdentity,
  deps: { accept: AcceptInvitation; resolve: () => Promise<KabinetIdentity> },
): Promise<HealedIdentity> {
  if (identity.principal.kind !== "no_role" || identity.userId === null) {
    return { kind: "resolved", identity };
  }
  const outcome = await deps.accept(identity.userId);
  switch (outcome.kind) {
    case "failed":
      return { kind: "join_failed" };
    case "nothing_to_accept":
      return { kind: "resolved", identity };
    // A conflict can mean a concurrent accept just made them a member: read
    // the role again rather than assume it is still none.
    case "accepted":
    case "address_has_a_role":
      return { kind: "resolved", identity: await deps.resolve() };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}
