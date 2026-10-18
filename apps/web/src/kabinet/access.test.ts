import type { KabinetAccess } from "@opika/contracts";
import { ModeratorIdSchema, ShelterAdminIdSchema, ShelterIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  assertShelterWritePolicyPermitted,
  decideAccess,
  registryOperatorOf,
  SHELTER_WRITE_POLICY,
  type ShelterWritePolicy,
  shelterWritePolicyOf,
} from "./access";
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

const OPEN: ShelterWritePolicy = { kind: "open_for_tests_only" };

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
      grantedBy: "open_policy",
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

/**
 * KH-T1, Oleksii's condition: the test-only switch must fail on a deployed
 * instance. The router applies this on every procedure
 * (`shelter-writes-refused.test.ts` drives it through the served route).
 */
describe("the test-only open policy is refused on a deployed instance (KH-T1)", () => {
  it.each([
    ["NODE_ENV=production", { NODE_ENV: "production" }],
    ["VERCEL_ENV=production", { NODE_ENV: "test", VERCEL_ENV: "production" }],
    ["VERCEL_ENV=preview", { NODE_ENV: "development", VERCEL_ENV: "preview" }],
    ["VERCEL_ENV=development", { VERCEL_ENV: "development" }],
  ])("throws under %s", (_label, env) => {
    expect(() => assertShelterWritePolicyPermitted(OPEN, env)).toThrow(/test-only/);
  });

  it.each([
    ["NODE_ENV=test", { NODE_ENV: "test" }],
    ["NODE_ENV=development, VERCEL_ENV blank", { NODE_ENV: "development", VERCEL_ENV: "" }],
    ["nothing set", {}],
  ])("allows it under %s (the handler suites)", (_label, env) => {
    expect(() => assertShelterWritePolicyPermitted(OPEN, env)).not.toThrow();
  });

  it("never refuses the served policy, deployed or not", () => {
    expect(() =>
      assertShelterWritePolicyPermitted(SHELTER_WRITE_POLICY, {
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).not.toThrow();
  });
});

/**
 * K-Q17 (Oleksii, verbatim: "K-Q17: (a). Allowlist from PR 2, with the three
 * updates done in PR 2 (validated KABINET_WRITE_ALLOWLIST, commitment #6
 * register entry + no-self-serve-yet.test.ts made conditional on "no shelter
 * outside the allowlist", one open path for that id). PR 6 deletes all of it.
 * Approved as a temporary mode with that fixed end.").
 */
describe("the allowlist policy (K-Q17)", () => {
  const OTHER_SHELTER = ShelterIdSchema.parse("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  const otherAdmin: KabinetPrincipal = {
    kind: "shelter_admin",
    shelterAdminId: ADMIN,
    shelterId: OTHER_SHELTER,
  };
  const allowlisted = shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: SHELTER });

  it("unset, blank or whitespace-only: the served refusal itself", () => {
    expect(shelterWritePolicyOf({})).toBe(SHELTER_WRITE_POLICY);
    expect(shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: "" })).toBe(SHELTER_WRITE_POLICY);
    expect(shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: "  " })).toBe(SHELTER_WRITE_POLICY);
  });

  it("set: opens writes for the listed shelter's admin, and the policy is frozen", () => {
    expect(allowlisted).toEqual({ kind: "open_for_allowlisted_shelter", shelterId: SHELTER });
    expect(Object.isFrozen(allowlisted)).toBe(true);
    expect(
      outcome(
        ACCESS.shelter_write ?? null,
        PRINCIPALS.shelter_admin as KabinetPrincipal,
        allowlisted,
      ),
    ).toBe("allow_shelter_write");
  });

  it("refuses every shelter outside the list with the not-yet code", () => {
    expect(outcome(ACCESS.shelter_write ?? null, otherAdmin, allowlisted)).toBe(NOT_YET);
  });

  it("changes exactly the listed admin's write cell, nothing else in the matrix", () => {
    for (const [principalName, principal] of Object.entries(PRINCIPALS)) {
      for (const [accessName, access] of Object.entries(ACCESS)) {
        const expected =
          OPEN_DELTA[principalName]?.[accessName] ?? EXPECTED[principalName]?.[accessName];
        expect(outcome(access, principal, allowlisted), `${principalName} × ${accessName}`).toBe(
          expected,
        );
      }
    }
  });

  it("a support view of the listed shelter still writes nothing", () => {
    expect(
      outcome(
        ACCESS.shelter_write ?? null,
        PRINCIPALS.support_view as KabinetPrincipal,
        allowlisted,
      ),
    ).toBe(F);
  });

  /**
   * Exactly one id (K-Q17, verbatim: "one open path for that id"): a second
   * opens nobody, the first included, rather than either of them.
   */
  it("two ids open neither: refused for everyone", () => {
    const two = shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: `${SHELTER},${OTHER_SHELTER}` });
    expect(two).toBe(SHELTER_WRITE_POLICY);
    for (const principal of [PRINCIPALS.shelter_admin as KabinetPrincipal, otherAdmin]) {
      expect(outcome(ACCESS.shelter_write ?? null, principal, two)).toBe(NOT_YET);
    }
  });

  /**
   * Every malformed value fails closed: the served refusal, so no shelter at
   * all can write. The build and boot checks are what make it loud
   * (`build-env.test.ts`).
   */
  it.each([
    ["padded before", ` ${SHELTER}`],
    ["padded after (a pasted newline)", `${SHELTER}\n`],
    ["a space after the comma", `${SHELTER}, ${OTHER_SHELTER}`],
    ["an empty item", `${SHELTER},`],
    ["uppercase", SHELTER.toUpperCase()],
    ["not a UUID", "test-shelter"],
    ["two ids", `${SHELTER},${OTHER_SHELTER}`],
    ["three ids", `${SHELTER},${OTHER_SHELTER},ffffffff-ffff-4fff-8fff-ffffffffffff`],
    ["the same id twice", `${SHELTER},${SHELTER}`],
    ["braces", `{${SHELTER}}`],
  ])("%s: refused for everyone", (_label, value) => {
    const policy = shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: value });
    expect(policy).toBe(SHELTER_WRITE_POLICY);
    expect(
      outcome(ACCESS.shelter_write ?? null, PRINCIPALS.shelter_admin as KabinetPrincipal, policy),
    ).toBe(NOT_YET);
  });

  it("is production-legal: a deployed instance accepts it (unlike the test-only one)", () => {
    expect(() =>
      assertShelterWritePolicyPermitted(allowlisted, {
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).not.toThrow();
  });
});

/**
 * CG-Q1: the write decision says which grant opened it, so only an allowlist
 * grant can mount the test-shelter-only area.
 */
describe("which grant opened a write (CG-Q1)", () => {
  const admin = PRINCIPALS.shelter_admin as KabinetPrincipal;
  const write = ACCESS.shelter_write ?? null;

  it("the allowlist grants as `allowlist`", () => {
    expect(
      decideAccess(write, admin, shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: SHELTER })),
    ).toMatchObject({ kind: "allow_shelter_write", grantedBy: "allowlist" });
  });

  it("a wider open policy grants as `open_policy`", () => {
    expect(decideAccess(write, admin, OPEN)).toMatchObject({
      kind: "allow_shelter_write",
      grantedBy: "open_policy",
    });
  });
});

/**
 * The pages' one way to ask who the operator is (`/kabinet`'s redirect, S4's
 * «ви»): the super_admin's own id, and nobody else, a support view included,
 * whatever the write policy.
 */
describe("registryOperatorOf", () => {
  const EXPECTED_OPERATOR: Record<string, string | null> = {
    anonymous: null,
    no_role: null,
    conflicting_roles: null,
    shelter_admin: null,
    support_view: null,
    super_admin: MOD,
  };

  it.each(Object.entries(PRINCIPALS))("%s", (name, principal) => {
    expect(Object.keys(EXPECTED_OPERATOR).sort()).toEqual(Object.keys(PRINCIPALS).sort());
    for (const policy of [SHELTER_WRITE_POLICY, OPEN]) {
      expect(registryOperatorOf(principal, policy)).toBe(EXPECTED_OPERATOR[name]);
    }
  });
});
