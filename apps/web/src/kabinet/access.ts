import type { KabinetAccess } from "@opika/contracts";
import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import type { KabinetPrincipal } from "./actor";
import { kabinetWriteAllowlistOf } from "./write-allowlist";

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
       * Which policy opened the write: `allowlist` (K-Q17, his test shelter)
       * or `open_policy` (any wider grant: the handler tests' one today, the
       * production one from PR 6). Only an `allowlist` grant mounts
       * `features/kabinet/test-shelter-only/`, whose copy may still be
       * pending (CG-Q1).
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
 * adds a production `open` variant, points `SHELTER_WRITE_POLICY` at it, and
 * deletes `open_for_tests_only`, its production guard and its source scan,
 * all in the same change. That PR is PR 6 of the K milestone, which also
 * deletes the allowlist below (`open_for_allowlisted_shelter`,
 * `write-allowlist.ts` and its env checks).
 *
 * **Until then, one exception (K-Q17, PR 2):** `KABINET_WRITE_ALLOWLIST`
 * may name Oleksii's own test shelter, one id and no more, whose admins can
 * then write, so each K PR can be tried on production. Every other shelter is
 * refused exactly as above, which is what keeps A1, A2 and B1 true: no real
 * shelter is ever named.
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
  /**
   * K-Q17 (Oleksii, verbatim: "one open path for that id ... Approved as a
   * temporary mode with that fixed end"): writes open for the one shelter
   * `KABINET_WRITE_ALLOWLIST` names, his own test shelter, and refused with
   * `SHELTER_WRITES_NOT_YET_AVAILABLE` for every other one. One id, not a
   * list, so a second can't be carried. Production-legal, unlike
   * `open_for_tests_only`: built only by `shelterWritePolicyOf` from the
   * validated variable. Commitment #6 holds for every other shelter. **PR 6
   * deletes this variant** when it adds the production `open` one.
   */
  | {
      readonly kind: "open_for_allowlisted_shelter";
      readonly shelterId: ShelterId;
    }
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
 * The policy the served route and the `/kabinet` page use (K-Q17): the
 * refusal, unless `KABINET_WRITE_ALLOWLIST` names a shelter, in which case
 * writes open for exactly that one. An invalid value fails closed (the refusal),
 * and the build and boot checks refuse it loudly (`kabinetWriteAllowlistProblem`),
 * so a value changed after the build can open nothing. The env is a
 * parameter so this stays pure; callers pass `process.env`.
 */
export function shelterWritePolicyOf(
  env: Readonly<Record<string, string | undefined>>,
): ShelterWritePolicy {
  const allowlist = kabinetWriteAllowlistOf(env);
  if (allowlist.kind !== "set") return SHELTER_WRITE_POLICY;
  return Object.freeze({
    kind: "open_for_allowlisted_shelter",
    shelterId: allowlist.shelterId,
  } as const);
}

/**
 * Whether a shelter admin of `shelterId` may write under `policy`, and by
 * which grant: the one place the answer is computed. Null means refused.
 */
function writeGrantFor(policy: ShelterWritePolicy, shelterId: ShelterId): WriteGrant | null {
  switch (policy.kind) {
    case "refused_until_edit_screens":
      return null;
    case "open_for_allowlisted_shelter":
      return policy.shelterId === shelterId ? "allowlist" : null;
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
 * reach `features/kabinet/test-shelter-only/`; under the allowlist only his
 * test shelter can. Any policy that opens writes more widely is strict. The
 * switch is exhaustive on purpose: PR 6's production `open` variant cannot
 * compile until it is classified here, and `test-shelter-copy-gate.test.ts`
 * requires an open policy to find no pending string anywhere.
 */
export function testShelterCopyExemptUnder(policy: ShelterWritePolicy): boolean {
  switch (policy.kind) {
    case "refused_until_edit_screens":
    case "open_for_allowlisted_shelter":
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
        // KH-Q1: the right actor, refused with its own code until PR 6, except
        // for a shelter on the K-Q17 allowlist.
        {
          const grantedBy = writeGrantFor(shelterWrites, principal.shelterId);
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
