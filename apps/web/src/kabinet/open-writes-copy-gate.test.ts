import { randomUUID } from "node:crypto";
import type { ShelterAdminId, ShelterId } from "@opika/domain";
import { pendingCopyPaths, uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import {
  decideAccess,
  SHELTER_WRITE_POLICY,
  type ShelterWritePolicy,
  shelterWritePolicyOf,
} from "./access";
import { kabinetPendingCopy, productionSignInOf } from "./production-sign-in";

/**
 * **PR 6 of the K milestone** (shelter writes open for every shelter) cannot
 * ship with a `[COPY PENDING]` string. CG-B1, Oleksii, verbatim: "At runtime,
 * sign-in ignores those strings only while the write policy is allowlist or
 * refused. Under the open policy, any pending string turns sign-in off." and
 * "A CI test fails when the policy is open and any pending string exists, so
 * PR 6 can't merge with one left."
 *
 * This file is that CI test, for both halves:
 *
 * - **CI:** under the policy the route serves, the live catalogue may carry no
 *   pending `kabinet.*` string that policy forbids. A policy that opens writes
 *   for every shelter forbids every one, the `kabinet.testShelterOnly`
 *   namespace (CG-Q1) included.
 * - **Runtime:** `productionSignInOf` turns production sign-in off for exactly
 *   the pending strings the same rule forbids, under every policy the code
 *   can build.
 *
 * "Open" is read from behaviour, never from a policy's name: a policy is open
 * when an admin of a shelter nobody listed, a fresh random id each run, may
 * write. So a production `open` variant is strict here the moment it exists,
 * whatever it is called, and a renamed refusal can't slip into the strict
 * branch's place. Until PR 6's switch commit the served policy refuses, and
 * the strict branch is exercised by the test-only open policy against
 * synthetic pending strings ("bites", below); from the switch on, the served
 * policy is the open one and the strict branch runs against the live
 * catalogue.
 */

/** The prefix CG-Q1 exempts, written out here rather than imported, so the gate's own constant can't redefine it. */
const NAMESPACE = "kabinet.testShelterOnly.";

/** The policy the route and the page serve (`route.ts`, `kabinet/page.tsx`), with no allowlist in the environment. */
const SERVED: ShelterWritePolicy = shelterWritePolicyOf({});

/** Every policy the code can build: the served one, the K-Q17 allowlist, and the test-only open one. */
const POLICIES: readonly [string, ShelterWritePolicy][] = [
  ["served", SERVED],
  [
    "allowlist set",
    shelterWritePolicyOf({ KABINET_WRITE_ALLOWLIST: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }),
  ],
  ["test-only open", { kind: "open_for_tests_only" }],
];

/** Whether an admin of shelters nobody listed may write under `policy`. */
function opensForEveryShelter(policy: ShelterWritePolicy): boolean {
  return [randomUUID(), randomUUID(), randomUUID()].every(
    (shelterId) =>
      decideAccess(
        { surface: "shelter", mode: "write" },
        {
          kind: "shelter_admin",
          shelterAdminId: randomUUID() as ShelterAdminId,
          shelterId: shelterId as ShelterId,
        },
        policy,
      ).kind === "allow_shelter_write",
  );
}

/** The pending paths CG-B1 forbids under `policy`: all of them under an open policy, else those outside the namespace. */
function forbiddenUnder(policy: ShelterWritePolicy, pending: readonly string[]): string[] {
  return opensForEveryShelter(policy)
    ? [...pending]
    : pending.filter((path) => !path.startsWith(NAMESPACE));
}

/** A production deployment with a working configuration (example values only), so only the copy can turn it off. */
const PRODUCTION = {
  VERCEL_ENV: "production",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "resend-key-example",
  EMAIL_FROM_ADDRESS: "noreply@mail.example.org",
  EMAIL_REPLY_TO: "hello@example.org",
  PRODUCTION_ORIGIN: "https://example.org",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://example.org",
};

const SYNTHETIC: readonly (readonly string[])[] = [
  [`${NAMESPACE}animalForm.dateUnchanged`],
  ["kabinet.email.invite.what"],
  ["kabinet.profileEdit.state.saved"],
  [`${NAMESPACE}animalForm.dateUnchanged`, "kabinet.signIn.title"],
  // A sibling that merely starts with the namespace's letters is not the namespace.
  ["kabinet.testShelterOnlyExtra.line"],
];

describe("PR 6: open shelter writes ship with no [COPY PENDING] string (CG-B1)", () => {
  it("sanity: the code builds both kinds, so neither branch of the rule is vacuous", () => {
    expect(POLICIES.map(([, policy]) => opensForEveryShelter(policy))).toContain(true);
    expect(POLICIES.map(([, policy]) => opensForEveryShelter(policy))).toContain(false);
  });

  it("CI: the live catalogue carries no pending string the served policy forbids", () => {
    expect(forbiddenUnder(SERVED, kabinetPendingCopy())).toEqual([]);
  });

  it("the walk the gate reads sees the whole kabinet catalogue", () => {
    // Guards the guard: an empty or narrowed walk would pass the line above.
    expect(kabinetPendingCopy()).toEqual(pendingCopyPaths(uk.kabinet, "kabinet"));
    const leaves = (node: unknown): number =>
      typeof node === "string"
        ? 1
        : Object.values(node as object).reduce<number>((sum, child) => sum + leaves(child), 0);
    expect(leaves(uk.kabinet)).toBeGreaterThan(500);
  });

  it.each(POLICIES)(
    "runtime (%s): production sign-in is off for exactly the pending strings the rule forbids",
    (_label, policy) => {
      for (const pending of SYNTHETIC) {
        const forbidden = forbiddenUnder(policy, pending);
        expect(productionSignInOf(PRODUCTION, pending, policy), pending.join(", ")).toEqual(
          forbidden.length === 0
            ? expect.objectContaining({ kind: "on" })
            : { kind: "off", reason: "copy_pending", pending: forbidden },
        );
      }
      expect(productionSignInOf(PRODUCTION, [], policy).kind).toBe("on");
    },
  );

  it("bites: under an open policy a pending namespace string is forbidden and turns sign-in off", () => {
    const open = POLICIES.find(([, policy]) => opensForEveryShelter(policy));
    if (open === undefined) throw new Error("no open policy to check");
    const line = [`${NAMESPACE}animalForm.dateUnchanged`];
    expect(forbiddenUnder(open[1], line)).toEqual(line);
    expect(productionSignInOf(PRODUCTION, line, open[1])).toEqual({
      kind: "off",
      reason: "copy_pending",
      pending: line,
    });
  });

  it("the /prytulkam and /pro strings PR 6 rewrites are never pending, under any policy", () => {
    expect(pendingCopyPaths(uk.forShelters, "forShelters")).toEqual([]);
    expect(pendingCopyPaths(uk.about, "about")).toEqual([]);
  });

  it("sanity: the served policy is the frozen constant the route passes", () => {
    expect(SERVED).toBe(SHELTER_WRITE_POLICY);
  });
});
