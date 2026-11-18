import { type KabinetAccess, registryContract } from "@opika/contracts";
import { ModeratorIdSchema, ShelterAdminIdSchema, ShelterIdSchema } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { decideAccess, SHELTER_WRITE_POLICY } from "../../../../kabinet/access";
import type { KabinetPrincipal } from "../../../../kabinet/actor";
import { applicationsBrowserContract } from "./applications-client";

/** The queue's browser client reaches exactly its four decisions, each operator only. */

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

const picked = leaves(applicationsBrowserContract);

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

describe("the «Заявки» browser client", () => {
  it("reaches exactly the queue decisions and the donation decisions, no read", () => {
    expect(picked.map((leaf) => leaf.path).sort()).toEqual([
      "registry.applications.accept",
      "registry.applications.reject",
      "registry.donation.approve",
      "registry.donation.reject",
    ]);
  });

  it("each is the registry contract's own procedure, so it keeps its access declaration", () => {
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
