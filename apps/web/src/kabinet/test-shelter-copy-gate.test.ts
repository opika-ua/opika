import { randomUUID } from "node:crypto";
import type { ShelterAdminId, ShelterId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  decideAccess,
  SHELTER_WRITE_POLICY,
  type ShelterWritePolicy,
  shelterWritePolicyOf,
  testShelterCopyExemptUnder,
} from "./access";
import { kabinetPendingCopy, TEST_SHELTER_ONLY_PREFIX } from "./production-sign-in";

/**
 * CG-Q1 (Oleksii, verbatim: "A CI test fails when the policy is open and any
 * pending string exists, so PR 6 can't merge with one left.").
 *
 * Every policy the served code can run with: what `shelterWritePolicyOf`
 * builds with the allowlist unset (the served refusal, `SHELTER_WRITE_POLICY`
 * itself) and set. Each is classified by an exhaustive switch over the policy
 * kinds, written here by hand rather than read from
 * `testShelterCopyExemptUnder`:
 *
 * - the refusal and the allowlist may carry pending strings under
 *   `kabinet.testShelterOnly` only, never anywhere else;
 * - an open policy may carry none at all.
 *
 * **How this bites in PR 6.** PR 6 adds the production `open` variant and
 * points the served policy at it. This file then fails to compile (the
 * `never` below) until someone adds its case, and the case to add is the
 * `strict` one: from that moment one pending string anywhere in `kabinet.*`,
 * the testShelterOnly namespace included, fails this test, so PR 6 cannot
 * merge with one left. Classifying the open variant as `namespace_only`
 * instead fails the behavioural check below (it grants a write to a shelter
 * nobody listed), and would also have to change `testShelterCopyExemptUnder`,
 * which the agreement check holds to this table.
 */
type Allowed = "namespace_only" | "strict";

function allowedPendingUnder(policy: ShelterWritePolicy): Allowed {
  switch (policy.kind) {
    case "refused_until_edit_screens":
    case "open_for_allowlisted_shelter":
      return "namespace_only";
    case "open_for_tests_only":
      return "strict";
    default: {
      const unclassified: never = policy;
      return unclassified;
    }
  }
}

const LISTED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const SERVED: readonly [string, ShelterWritePolicy][] = [
  ["shelterWritePolicyOf, allowlist unset (SHELTER_WRITE_POLICY)", shelterWritePolicyOf({})],
  [
    "shelterWritePolicyOf, allowlist set",
    shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: LISTED }),
  ],
];

/** Every kind, the test-only open one included (built by hand: no env builds it). */
const EVERY_KIND: readonly ShelterWritePolicy[] = [
  ...SERVED.map(([, policy]) => policy),
  { kind: "open_for_tests_only" },
];

const outsideNamespace = (paths: readonly string[]) =>
  paths.filter((path) => !path.startsWith(TEST_SHELTER_ONLY_PREFIX));

/** What the served copy gate would require of a catalogue's pending paths under `policy`. */
function violations(pending: readonly string[], policy: ShelterWritePolicy): readonly string[] {
  return allowedPendingUnder(policy) === "strict" ? pending : outsideNamespace(pending);
}

/**
 * What "open" means, read from behaviour rather than from the kind's name: the
 * policy lets an admin of a shelter nobody listed write. A fresh random id
 * each run, so no fixed id can be special-cased into a policy.
 */
function grantsAnUnlistedShelter(policy: ShelterWritePolicy): boolean {
  const unlisted = randomUUID() as ShelterId;
  const decision = decideAccess(
    { surface: "shelter", mode: "write" },
    {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
      shelterId: unlisted,
    },
    policy,
  );
  return decision.kind === "allow_shelter_write";
}

describe("an open write policy leaves no pending string anywhere (CG-Q1)", () => {
  it.each(SERVED)("%s: the live catalogue has nothing pending it forbids", (_label, policy) => {
    expect(violations(kabinetPendingCopy(), policy), policy.kind).toEqual([]);
  });

  it("the sign-in gate agrees with this table for every policy kind", () => {
    for (const policy of EVERY_KIND) {
      expect(testShelterCopyExemptUnder(policy), policy.kind).toBe(
        allowedPendingUnder(policy) === "namespace_only",
      );
    }
  });

  /**
   * Review finding 6: the table is by hand, so it is also checked against what
   * each policy does. A policy that grants a write to an arbitrary unlisted
   * shelter is open, and must be `strict`; one that grants none is not.
   */
  it("the table agrees with behaviour: strict exactly when an unlisted shelter can write", () => {
    for (const policy of EVERY_KIND) {
      expect(allowedPendingUnder(policy) === "strict", `${policy.kind} is open`).toBe(
        grantsAnUnlistedShelter(policy),
      );
    }
    // The behavioural check sees both answers, so agreement isn't vacuous.
    expect(EVERY_KIND.map(grantsAnUnlistedShelter)).toEqual([false, false, true]);
  });

  it("bites: under an open policy a pending namespace string is a violation", () => {
    const pending = ["kabinet.testShelterOnly.k3.photoHint"];
    expect(violations(pending, { kind: "open_for_tests_only" })).toEqual(pending);
    expect(violations(pending, SHELTER_WRITE_POLICY)).toEqual([]);
    expect(violations(["kabinet.email.signIn.subject"], SHELTER_WRITE_POLICY)).toEqual([
      "kabinet.email.signIn.subject",
    ]);
  });
});
