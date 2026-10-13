import type { KabinetAccess } from "@opika/contracts";
import { ModeratorIdSchema, ShelterAdminIdSchema, ShelterIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { decideAccess } from "./access";
import type { KabinetPrincipal } from "./actor";

const SHELTER = ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
const ADMIN = ShelterAdminIdSchema.parse("33333333-3333-4333-8333-333333333333");
const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");

const PRINCIPALS: Record<string, KabinetPrincipal> = {
  anonymous: { kind: "anonymous" },
  no_role: { kind: "no_role" },
  conflicting_roles: { kind: "conflicting_roles" },
  shelter_admin: { kind: "shelter_admin", shelterAdminId: ADMIN, shelterId: SHELTER },
  support_view: { kind: "support_view", moderatorId: MOD, shelterId: SHELTER },
  super_admin: { kind: "super_admin", moderatorId: MOD },
};

const ACCESS: Record<string, KabinetAccess | null> = {
  undeclared: null,
  shelter_read: { surface: "shelter", mode: "read" },
  shelter_write: { surface: "shelter", mode: "write" },
  registry: { surface: "registry" },
  support_exit: { surface: "support_exit" },
};

/**
 * The matrix, transcribed by hand from addendum §1 (and proposal §6's
 * anon/adopter columns: an adopter cookie is not a kabinet session, so it
 * arrives here as `anonymous`). Not derived from `decideAccess` or from the
 * contract's meta: a table read back from the code would agree with any bug.
 */
const U = "UNAUTHENTICATED";
const F = "FORBIDDEN";
const EXPECTED: Record<string, Record<string, string>> = {
  //                 undeclared  shelter_read          shelter_write          registry          support_exit
  anonymous: { undeclared: U, shelter_read: U, shelter_write: U, registry: U, support_exit: U },
  no_role: { undeclared: F, shelter_read: F, shelter_write: F, registry: F, support_exit: F },
  conflicting_roles: {
    undeclared: F,
    shelter_read: F,
    shelter_write: F,
    registry: F,
    support_exit: F,
  },
  shelter_admin: {
    undeclared: F,
    shelter_read: "allow_shelter_read",
    shelter_write: "allow_shelter_write",
    registry: F,
    support_exit: F,
  },
  support_view: {
    undeclared: F,
    shelter_read: "allow_shelter_read",
    shelter_write: F,
    registry: F,
    support_exit: "allow_support_exit",
  },
  super_admin: {
    undeclared: F,
    shelter_read: F,
    shelter_write: F,
    registry: "allow_registry",
    support_exit: F,
  },
};

const outcome = (access: KabinetAccess | null, principal: KabinetPrincipal) => {
  const decision = decideAccess(access, principal);
  return decision.kind === "deny" ? decision.code : decision.kind;
};

describe("the kabinet access matrix", () => {
  it("has a row per principal and a column per access level", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(PRINCIPALS).sort());
    for (const row of Object.values(EXPECTED)) {
      expect(Object.keys(row).sort()).toEqual(Object.keys(ACCESS).sort());
    }
  });

  for (const [principalName, principal] of Object.entries(PRINCIPALS)) {
    for (const [accessName, access] of Object.entries(ACCESS)) {
      it(`${principalName} × ${accessName} → ${EXPECTED[principalName]?.[accessName]}`, () => {
        expect(outcome(access, principal)).toBe(EXPECTED[principalName]?.[accessName]);
      });
    }
  }
});

describe("the scope an allowed shelter call gets", () => {
  it("takes the shelter from the actor, for an admin and for a support view", () => {
    expect(
      decideAccess(ACCESS.shelter_write ?? null, PRINCIPALS.shelter_admin ?? { kind: "anonymous" }),
    ).toEqual({
      kind: "allow_shelter_write",
      scope: { kind: "shelter_admin", shelterId: SHELTER, shelterAdminId: ADMIN },
    });
    expect(
      decideAccess(ACCESS.shelter_read ?? null, PRINCIPALS.support_view ?? { kind: "anonymous" }),
    ).toEqual({
      kind: "allow_shelter_read",
      scope: { kind: "support_view", shelterId: SHELTER, moderatorId: MOD },
    });
  });
});
