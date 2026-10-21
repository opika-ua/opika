import type { KabinetAccess } from "@opika/contracts";
import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import type { KabinetPrincipal } from "./actor";

/**
 * What a handler on the shelter surface is allowed to act as. It carries the
 * `shelterId` every `shelter.*` procedure works on, taken from the actor and
 * never from input (proposal §2). A write scope can only be a shelter admin,
 * so a support view can't reach a write handler even by mistake.
 */
export type ShelterReadScope =
  | { kind: "shelter_admin"; shelterId: ShelterId; shelterAdminId: ShelterAdminId }
  | { kind: "support_view"; shelterId: ShelterId; moderatorId: ModeratorId };
export type ShelterWriteScope = Extract<ShelterReadScope, { kind: "shelter_admin" }>;

export type AccessDecision =
  | { kind: "allow_shelter_read"; scope: ShelterReadScope }
  | { kind: "allow_shelter_write"; scope: ShelterWriteScope }
  | { kind: "allow_registry"; moderatorId: ModeratorId }
  | { kind: "allow_support_exit"; moderatorId: ModeratorId; shelterId: ShelterId }
  /** The invitation link's «Створіть пароль» (PW-2): the token, checked by the handler, is the credential. */
  | { kind: "allow_invitation_link" }
  | { kind: "deny"; code: "UNAUTHENTICATED" | "FORBIDDEN" };

const FORBIDDEN = { kind: "deny", code: "FORBIDDEN" } as const;

/**
 * Whether a shelter admin's `shelter.*` writes are open: **open, for every
 * shelter's own admins** since PR 6 of the K milestone (K-Q3, Oleksii,
 * verbatim: "K-Q3: live immediately. PR 6 rewrites commitment #6."; K-Q4:
 * the allowlist "removed in PR 6 when the policy opens for everyone").
 *
 * Before PR 6 this refused every write (KH-Q1), because /prytulkam said a
 * person entered and removed everything (A1, A2) and that the date moved
 * only on a confirmation (B1); PR 6 ships those sentences' replacements in
 * the same change (his Ukrainian, pinned in `copy-status.test.ts`), so the
 * page describes this policy. The K-Q17 allowlist (one test shelter, read
 * from an environment variable) and the test-only open policy are gone with
 * the refusal: no environment variable and no request field decides who may
 * write, and a support view, another shelter's admin and every other
 * principal still can't (`decideAccess` below, `access.test.ts`,
 * `shelter-writes-open.test.ts`).
 *
 * A union of one on purpose (PC-T4): `decideAccess` switches on it
 * exhaustively, so a second variant (an off switch, if one is ever needed)
 * can't compile until every caller is walked to.
 */
export type ShelterWritePolicy = { readonly kind: "open" };

/**
 * Frozen and readonly (review of the hardening, finding 2): a mutable object
 * typed as the policy would let `SHELTER_WRITE_POLICY.kind = ...` type-check
 * anywhere. The route and every `/kabinet` page pass this constant by name
 * (`allowlist-removed.test.ts`).
 */
export const SHELTER_WRITE_POLICY: ShelterWritePolicy = Object.freeze({ kind: "open" } as const);

/**
 * The access matrix (addendum §1), as one pure function. The middleware only
 * applies its answer; the matrix test asserts it cell by cell against a
 * hand-written table.
 *
 * Order matters: no session is UNAUTHENTICATED whatever the procedure, so an
 * anonymous caller learns nothing about which procedures exist or what they
 * need, with one exception, decided first: the invitation link (PW-2), whose
 * caller is signed out by design (the link's token is the credential, and the
 * handler checks it). It admits exactly the visitors the link's page shows the
 * form to: nobody signed in, or a signed-in user with no role (an invitee
 * whose earlier accept failed). A shelter admin, the operator, a support view
 * and a conflicting user are FORBIDDEN, so no signed-in role is swapped for
 * the invitee's session by a POST. A procedure with no declared access is
 * refused for everyone (deny-by-default), after that. The write policy is applied here, the one
 * choke point every shelter write passes, so no handler can skip it;
 * `shelterWrites` is a required argument so no caller can either.
 */
export function decideAccess(
  access: KabinetAccess | null,
  principal: KabinetPrincipal,
  shelterWrites: ShelterWritePolicy,
): AccessDecision {
  if (access?.surface === "invitation_link") {
    return principal.kind === "anonymous" || principal.kind === "no_role"
      ? { kind: "allow_invitation_link" }
      : FORBIDDEN;
  }
  if (principal.kind === "anonymous") return { kind: "deny", code: "UNAUTHENTICATED" };
  if (access === null) return FORBIDDEN;
  if (principal.kind === "no_role" || principal.kind === "conflicting_roles") return FORBIDDEN;

  switch (access.surface) {
    case "shelter":
      if (principal.kind === "shelter_admin") {
        const scope = {
          kind: "shelter_admin",
          shelterId: principal.shelterId,
          shelterAdminId: principal.shelterAdminId,
        } as const;
        if (access.mode === "read") return { kind: "allow_shelter_read", scope };
        // Its own shelter only: the scope's shelter is the principal's, never input's.
        switch (shelterWrites.kind) {
          case "open":
            return { kind: "allow_shelter_write", scope };
          /* v8 ignore next 4 -- exists so the compiler rejects an unhandled policy; unreachable at runtime */
          default: {
            const unreachable: never = shelterWrites.kind;
            return unreachable;
          }
        }
      }
      // A support view reads the one shelter it entered, and writes nothing.
      // A super_admin outside support mode reads no shelter's cabinet at all:
      // entering support is what makes the viewing visible and time-boxed.
      if (principal.kind === "support_view" && access.mode === "read") {
        return {
          kind: "allow_shelter_read",
          scope: {
            kind: "support_view",
            shelterId: principal.shelterId,
            moderatorId: principal.moderatorId,
          },
        };
      }
      return FORBIDDEN;
    case "registry":
      return principal.kind === "super_admin"
        ? { kind: "allow_registry", moderatorId: principal.moderatorId }
        : FORBIDDEN;
    case "support_exit":
      return principal.kind === "support_view"
        ? {
            kind: "allow_support_exit",
            moderatorId: principal.moderatorId,
            shelterId: principal.shelterId,
          }
        : FORBIDDEN;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled surface; unreachable at runtime */
    default: {
      const unreachable: never = access;
      return unreachable;
    }
  }
}

/** The registry surface as the contract declares it on every `registry.*` procedure. */
const REGISTRY_ACCESS: KabinetAccess = { surface: "registry" };

/**
 * The operator the registry would let in, or null for anyone else: the
 * matrix's own `registry` cell, for a page that has to know who that is
 * (`/kabinet` sending the operator to their list, S4's history reading «ви»)
 * without a `principal.kind` check of its own.
 */
export function registryOperatorOf(
  principal: KabinetPrincipal,
  shelterWrites: ShelterWritePolicy,
): ModeratorId | null {
  const decision = decideAccess(REGISTRY_ACCESS, principal, shelterWrites);
  return decision.kind === "allow_registry" ? decision.moderatorId : null;
}
