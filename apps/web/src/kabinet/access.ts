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
  | {
      kind: "deny";
      code: "UNAUTHENTICATED" | "FORBIDDEN" | "SHELTER_WRITES_NOT_YET_AVAILABLE";
    };

const FORBIDDEN = { kind: "deny", code: "FORBIDDEN" } as const;

/**
 * Whether a shelter admin's `shelter.*` writes are open (inbox KH-Q1).
 *
 * **Refused until K2/K3 ship.** No screen calls any write yet, but once
 * production sign-in is on, a signed-in shelter admin could call every one of
 * them straight over `/api/kabinet/*`. Three things the /prytulkam page says
 * stay true only while they can't: A1 «ви розкажете, а я внесу все сам» and
 * A2 «напишіть, і я приберу» (the work is done by a person, commitment #6),
 * and B1 / commitment #7 (the freshness date moves only on a shelter's
 * explicit confirmation, through a screen that says so). An open
 * `animals.confirm` or `animals.update` with no screen and the old copy live
 * would falsify all three.
 *
 * **What lifts it:** the K2/K3 PR that ships the editing and confirming
 * screens *and* the replacement copy for A1/A2/B1 (docs/h2-copy-sheet.md)
 * changes `SHELTER_WRITE_POLICY` to `open`, in the same change.
 *
 * `open` exists today for one reason: the K2/K3 handler suites
 * (`handlers.test.ts`, `api/kabinet-cross-tenant.test.ts`) exercise those
 * handlers through the served router and pass it explicitly. Every non-test
 * caller passes `SHELTER_WRITE_POLICY`; `shelter-writes-refused.test.ts`
 * pins both that and the constant's value.
 */
export type ShelterWritePolicy = { kind: "refused_until_edit_screens" } | { kind: "open" };

export const SHELTER_WRITE_POLICY: ShelterWritePolicy = { kind: "refused_until_edit_screens" };

/**
 * The access matrix (addendum §1), as one pure function. The middleware only
 * applies its answer; the matrix test asserts it cell by cell against a
 * hand-written table.
 *
 * Order matters: no session is UNAUTHENTICATED whatever the procedure, so an
 * anonymous caller learns nothing about which procedures exist or what they
 * need. A procedure with no declared access is refused for everyone
 * (deny-by-default), after that. The write refusal (KH-Q1) is decided here,
 * the one choke point every shelter write passes, so no handler can forget
 * it; `shelterWrites` is a required argument so no caller can either.
 */
export function decideAccess(
  access: KabinetAccess | null,
  principal: KabinetPrincipal,
  shelterWrites: ShelterWritePolicy,
): AccessDecision {
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
        // KH-Q1: the right actor, refused with its own code until K2/K3 ship.
        return shelterWrites.kind === "open"
          ? { kind: "allow_shelter_write", scope }
          : { kind: "deny", code: "SHELTER_WRITES_NOT_YET_AVAILABLE" };
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
