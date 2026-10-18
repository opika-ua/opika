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
  | {
      kind: "allow_shelter_write";
      scope: ShelterWriteScope;
      /**
       * Which policy opened the write. Only an `allowlist` grant mounted
       * `features/kabinet/test-shelter-only/`, whose copy could be pending
       * (CG-Q1). PR 6 deleted the K-Q17 allowlist, so nothing grants
       * `allowlist` any more; the member goes with that folder, later in the
       * same PR. `open_policy` is any wider grant.
       */
      grantedBy: WriteGrant;
    }
  | { kind: "allow_registry"; moderatorId: ModeratorId }
  | { kind: "allow_support_exit"; moderatorId: ModeratorId; shelterId: ShelterId }
  | {
      kind: "deny";
      code: "UNAUTHENTICATED" | "FORBIDDEN" | "SHELTER_WRITES_NOT_YET_AVAILABLE";
    };

export type WriteGrant = "allowlist" | "open_policy";

const FORBIDDEN = { kind: "deny", code: "FORBIDDEN" } as const;

/**
 * Whether a shelter admin's `shelter.*` writes are open (inbox KH-Q1).
 *
 * **Refused until PR 6's switch.** No screen calls any write yet, but once
 * production sign-in is on, a signed-in shelter admin could call every one of
 * them straight over `/api/kabinet/*`. Three things the /prytulkam page says
 * stay true only while they can't: A1 «ви розкажете, а я внесу все сам» and
 * A2 «напишіть, і я приберу» (the work is done by a person, commitment #6),
 * and B1 / commitment #7 (the freshness date moves only on a shelter's
 * explicit confirmation, through a screen that says so). An open
 * `animals.confirm` or `animals.update` with no screen and the old copy live
 * would falsify all three.
 *
 * **What lifts it:** PR 6 of the K milestone, which ships the replacement
 * copy for A1/A2/B1 (docs/pr6-checklist.md), adds a production `open`
 * variant, points `SHELTER_WRITE_POLICY` at it, and deletes
 * `open_for_tests_only`, its production guard and its source scan, in its
 * final commit. PR 6's earlier commits already deleted the K-Q17 allowlist
 * (the environment variable that let his test shelter write): no
 * environment variable opens a write any more.
 *
 * `open_for_tests_only` exists today for one reason: the K2/K3 handler
 * suites (`handlers.test.ts`, `registry.test.ts`,
 * `api/kabinet-cross-tenant.test.ts`) exercise those handlers through the
 * served router and pass it explicitly. It is a value on the request
 * context, never an environment variable (KH-T1, Oleksii: "the test-only
 * switch must not be an environment variable readable in production"). Its
 * name is unique in the codebase on purpose: `shelter-writes-refused.test.ts`
 * fails if the literal appears in any non-test file but this one, however it
 * is spelled at the use site (shorthand property, spread, computed key), and
 * pins the constant's value. `assertShelterWritePolicyPermitted` makes a
 * deployed instance refuse it outright, so even a path the scan missed fails
 * closed.
 */
export type ShelterWritePolicy =
  | { readonly kind: "refused_until_edit_screens" }
  | { readonly kind: "open_for_tests_only" };

/**
 * Frozen and readonly (review of the hardening, finding 2): a mutable object
 * typed as the union would let `SHELTER_WRITE_POLICY.kind = ...` type-check
 * anywhere, and silently open every served write for the life of the process.
 */
export const SHELTER_WRITE_POLICY: ShelterWritePolicy = Object.freeze({
  kind: "refused_until_edit_screens",
} as const);

/**
 * Whether a shelter admin may write under `policy`, and by which grant: the
 * one place the answer is computed. Null means refused.
 */
function writeGrantFor(policy: ShelterWritePolicy): WriteGrant | null {
  switch (policy.kind) {
    case "refused_until_edit_screens":
      return null;
    case "open_for_tests_only":
      return "open_policy";
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled policy; unreachable at runtime */
    default: {
      const unreachable: never = policy;
      return unreachable;
    }
  }
}

/**
 * Whether pending strings in the test-shelter-only copy namespace (CG-Q1)
 * may be ignored by production sign-in under `policy` (Oleksii, verbatim:
 * "At runtime, sign-in ignores those strings only while the write policy is
 * allowlist or refused. Under the open policy, any pending string turns
 * sign-in off."). The copy gate itself is `signInBlockingCopy`
 * (`production-sign-in.ts`); the classification lives here, beside the
 * policy kinds, so no other file names them. Under the refusal nobody can
 * reach `features/kabinet/test-shelter-only/`. Any policy that opens writes
 * is strict. The switch is exhaustive on purpose: PR 6's production `open`
 * variant cannot compile until it is classified here, and
 * `open-writes-copy-gate.test.ts` requires an open policy to find no pending
 * string anywhere.
 */
export function testShelterCopyExemptUnder(policy: ShelterWritePolicy): boolean {
  switch (policy.kind) {
    case "refused_until_edit_screens":
      return true;
    case "open_for_tests_only":
      return false;
    /* v8 ignore next 4 -- exists so the compiler rejects an unclassified policy; unreachable at runtime */
    default: {
      const unreachable: never = policy;
      return unreachable;
    }
  }
}

/**
 * Throws when the test-only open policy reaches a deployed instance (KH-T1,
 * Oleksii's condition: "make it fail if NODE_ENV=production or VERCEL_ENV is
 * set"). `NODE_ENV=production` covers `next start` anywhere, the harness
 * included, and `VERCEL_ENV` covers every Vercel deployment whatever its
 * `NODE_ENV`. The env is a parameter so this stays pure; the router reads
 * `process.env` itself and passes it (`accessOrThrow`), so no caller can
 * hand it a friendlier one.
 */
export function assertShelterWritePolicyPermitted(
  policy: ShelterWritePolicy,
  env: { NODE_ENV?: string | undefined; VERCEL_ENV?: string | undefined },
): void {
  if (policy.kind !== "open_for_tests_only") return;
  if (env.NODE_ENV === "production" || (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "")) {
    throw new Error(
      "The test-only shelter write policy reached a deployed instance; refusing the request",
    );
  }
}

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
        // KH-Q1: the right actor, refused with its own code until PR 6's switch.
        {
          const grantedBy = writeGrantFor(shelterWrites);
          return grantedBy === null
            ? { kind: "deny", code: "SHELTER_WRITES_NOT_YET_AVAILABLE" }
            : { kind: "allow_shelter_write", scope, grantedBy };
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
