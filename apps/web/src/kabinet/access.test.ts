import type { KabinetAccess } from "@opika/contracts";
import { ModeratorIdSchema, ShelterAdminIdSchema, ShelterIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { decideAccess, SHELTER_WRITE_POLICY, type ShelterWritePolicy } from "./access";
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
 * arrives here as `anonymous`), with KH-Q1's write refusal in the shelter_admin
 * row. Not derived from `decideAccess` or from the
 * contract's meta: a table read back from the code would agree with any bug.
 */
const U = "UNAUTHENTICATED";
const F = "FORBIDDEN";
/** KH-Q1: a shelter admin's writes, refused with their own code until K2/K3. */
const NOT_YET = "SHELTER_WRITES_NOT_YET_AVAILABLE";
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
    shelter_write: NOT_YET,
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

/**
 * With writes opened (what the K2/K3 PR flips `SHELTER_WRITE_POLICY` to),
 * exactly one cell changes. Written as that one cell, by hand, so opening
 * writes can't widen anything else.
 */
const OPEN_DELTA: Record<string, Record<string, string>> = {
  shelter_admin: { shelter_write: "allow_shelter_write" },
};

const OPEN: ShelterWritePolicy = { kind: "open" };

const outcome = (
  access: KabinetAccess | null,
  principal: KabinetPrincipal,
  policy: ShelterWritePolicy = SHELTER_WRITE_POLICY,
) => {
  const decision = decideAccess(access, principal, policy);
  return decision.kind === "deny" ? decision.code : decision.kind;
};

describe("the served write policy (KH-Q1)", () => {
  it("refuses shelter writes until K2/K3 ship", () => {
    expect(SHELTER_WRITE_POLICY).toEqual({ kind: "refused_until_edit_screens" });
  });
});

describe("the kabinet access matrix, with writes opened (K2/K3)", () => {
  for (const [principalName, principal] of Object.entries(PRINCIPALS)) {
    for (const [accessName, access] of Object.entries(ACCESS)) {
      const expected =
        OPEN_DELTA[principalName]?.[accessName] ?? EXPECTED[principalName]?.[accessName];
      it(`${principalName} × ${accessName} → ${expected}`, () => {
        expect(outcome(access, principal, OPEN)).toBe(expected);
      });
    }
  }
});

describe("the kabinet access matrix, as served (shelter writes refused, KH-Q1)", () => {
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
      decideAccess(
        ACCESS.shelter_write ?? null,
        PRINCIPALS.shelter_admin ?? { kind: "anonymous" },
        OPEN,
      ),
    ).toEqual({
      kind: "allow_shelter_write",
      scope: { kind: "shelter_admin", shelterId: SHELTER, shelterAdminId: ADMIN },
    });
    expect(
      decideAccess(
        ACCESS.shelter_read ?? null,
        PRINCIPALS.support_view ?? { kind: "anonymous" },
        SHELTER_WRITE_POLICY,
      ),
    ).toEqual({
      kind: "allow_shelter_read",
      scope: { kind: "support_view", shelterId: SHELTER, moderatorId: MOD },
    });
  });
});
