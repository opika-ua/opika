import { type KabinetAccess, registryContract } from "@opika/contracts";
import { ModeratorIdSchema, ShelterAdminIdSchema, ShelterIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { decideAccess, SHELTER_WRITE_POLICY } from "../../../../kabinet/access";
import type { KabinetPrincipal } from "../../../../kabinet/actor";
import { registryActionsBrowserContract } from "./registry-actions-client";

/**
 * The access rows for S4's new callers. The browser client may reach exactly
 * the registry writes R-UI 3 needs (written out here by hand, never read back
 * from the client), each the contract's own procedure object, so each carries
 * the registry's access declaration. That declaration, through the kabinet's
 * own `decideAccess`, lets a super_admin outside support mode in and nobody
 * else, a support view of the very shelter included. The served route's
 * refusal of each of these procedures, with a real request, is
 * `kabinet-registry-access.test.ts`'s (all nineteen registry procedures).
 */

type Leaf = { path: string; node: { "~orpc": { meta: unknown } } };

function leaves(node: unknown, path: readonly string[] = []): Leaf[] {
  if (node !== null && typeof node === "object" && "~orpc" in node) {
    return [{ path: path.join("."), node: node as Leaf["node"] }];
  }
  if (node !== null && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      leaves(value, [...path, key]),
    );
  }
  return [];
}

const picked = leaves(registryActionsBrowserContract);

/** What R-UI 3's controls call, by hand (the task's list). */
const EXPECTED_PATHS = [
  "registry.verification.startReview",
  "registry.verification.approve",
  "registry.verification.reject",
  "registry.verification.suspend",
  "registry.verification.reinstate",
  "registry.verification.resubmit",
  "registry.donation.approve",
  "registry.donation.reject",
  "registry.admins.invite",
  "registry.admins.resendInvite",
  "registry.admins.remove",
  "registry.support.enter",
];

const contractNode = (path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      registryContract,
    );

const SHELTER = ShelterIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const PRINCIPALS: [string, KabinetPrincipal, string][] = [
  ["anonymous", { kind: "anonymous" }, "UNAUTHENTICATED"],
  ["no_role", { kind: "no_role" }, "FORBIDDEN"],
  ["conflicting_roles", { kind: "conflicting_roles" }, "FORBIDDEN"],
  [
    "shelter_admin of the shelter",
    {
      kind: "shelter_admin",
      shelterAdminId: ShelterAdminIdSchema.parse("33333333-3333-4333-8333-333333333333"),
      shelterId: SHELTER,
    },
    "FORBIDDEN",
  ],
  [
    "support_view of the shelter",
    { kind: "support_view", moderatorId: MOD, shelterId: SHELTER },
    "FORBIDDEN",
  ],
  ["super_admin outside support", { kind: "super_admin", moderatorId: MOD }, "allow_registry"],
];

describe("the S4 actions browser client", () => {
  it("reaches exactly the twelve registry writes R-UI 3 calls", () => {
    expect(picked.map((leaf) => leaf.path).sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  it("has no read, no create or edit, and nothing from another surface", () => {
    const paths = picked.map((leaf) => leaf.path);
    for (const absent of [
      "registry.shelters.byId",
      "registry.shelters.list",
      "registry.shelters.create",
      "registry.shelters.updateProfile",
      "registry.shelters.updateVerifiedData",
      "registry.history.list",
      "registry.admins.blockedAddresses",
      "session.exitSupport",
    ]) {
      expect(paths).not.toContain(absent);
    }
  });

  it("each procedure is the registry contract's own object, so it keeps its access declaration", () => {
    for (const leaf of picked) expect(leaf.node, leaf.path).toBe(contractNode(leaf.path));
  });

  for (const [who, principal, expected] of PRINCIPALS) {
    it(`${who}: every one of them → ${expected}`, () => {
      for (const leaf of picked) {
        const meta = leaf.node["~orpc"].meta as { access?: KabinetAccess | null };
        const decision = decideAccess(meta.access ?? null, principal, SHELTER_WRITE_POLICY);
        expect(decision.kind === "deny" ? decision.code : decision.kind, leaf.path).toBe(expected);
      }
    });
  }
});
