import { randomUUID } from "node:crypto";
import type { ShelterAdminId, ShelterId } from "@opika/domain";
import { pendingCopyPaths, uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { decideAccess, SHELTER_WRITE_POLICY } from "./access";
import { kabinetPendingCopy, productionSignInOf } from "./production-sign-in";

/**
 * **PR 6 of the K milestone** (shelter writes open for every shelter) cannot
 * ship with a `[COPY PENDING]` string. CG-B1, Oleksii, verbatim: "At runtime,
 * sign-in ignores those strings only while the write policy is allowlist or
 * refused. Under the open policy, any pending string turns sign-in off." and
 * "A CI test fails when the policy is open and any pending string exists, so
 * PR 6 can't merge with one left."
 *
 * PR 6 deleted the allowlist and, with it, the one namespace sign-in could
 * ignore (`kabinet.testShelterOnly`, his 0.3a), so both halves are now
 * strict whatever the policy:
 *
 * - **CI:** the live catalogue carries no pending `kabinet.*` string at all;
 * - **Runtime:** `productionSignInOf` turns production sign-in off for any
 *   pending `kabinet.*` string, the former namespace's paths included, and is
 *   on with none, so the off is the copy's doing.
 *
 * And the policy those halves guard is the open one: the served policy lets
 * the admin of any shelter, a fresh random id each run, write its own
 * shelter. "Open" is read from behaviour, never from the policy's name.
 */

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
  ["kabinet.testShelterOnly.animalForm.dateUnchanged"],
  ["kabinet.email.invite.what"],
  ["kabinet.profileEdit.state.saved"],
  ["kabinet.animalList.stale.caption"],
  ["kabinet.testShelterOnly.animalForm.dateUnchanged", "kabinet.signIn.title"],
];

describe("PR 6: open shelter writes ship with no [COPY PENDING] string (CG-B1)", () => {
  it("the served policy is open: any shelter's own admin may write", () => {
    for (const shelterId of [randomUUID(), randomUUID(), randomUUID()]) {
      expect(
        decideAccess(
          { surface: "shelter", mode: "write" },
          {
            kind: "shelter_admin",
            shelterAdminId: randomUUID() as ShelterAdminId,
            shelterId: shelterId as ShelterId,
          },
          SHELTER_WRITE_POLICY,
        ),
      ).toMatchObject({ kind: "allow_shelter_write", scope: { shelterId } });
    }
  });

  it("CI: the live kabinet catalogue has no pending string, and no namespace is exempt", () => {
    expect(kabinetPendingCopy()).toEqual([]);
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

  it.each(SYNTHETIC)(
    "runtime: production sign-in is off for pending %s, naming every one",
    (...pending) => {
      expect(productionSignInOf(PRODUCTION, pending)).toEqual({
        kind: "off",
        reason: "copy_pending",
        pending,
      });
    },
  );

  it("runtime: and on with nothing pending, so the off above is the copy's doing", () => {
    expect(productionSignInOf(PRODUCTION, []).kind).toBe("on");
  });

  /**
   * Q-B (Oleksii, 2026-10-19), verbatim: "(a). The guard checks the entire catalogue; nothing
   * pending anywhere." Not only kabinet, /prytulkam and /pro: the whole live catalogue, the
   * public animal page's screen-reader labels included.
   */
  it("nothing in the entire uk catalogue is pending", () => {
    expect(pendingCopyPaths(uk, "uk")).toEqual([]);
  });
});
