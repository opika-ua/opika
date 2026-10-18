import { registryContract } from "@opika/contracts";
import { describe, expect, it } from "vitest";
import { registryCreateBrowserContract } from "./registry-create-client";

/**
 * S2's browser client is picked, never the whole registry contract: a
 * procedure added later must not become callable from this page's
 * JavaScript by default (`api/browser-client.ts`'s reason). Each entry is
 * the contract's own procedure, so the server's schemas are the ones the
 * client is typed by.
 */
const leaves = (node: object, path: string[] = []): string[] =>
  Object.entries(node).flatMap(([key, value]) =>
    value !== null && typeof value === "object" && !("~orpc" in value)
      ? leaves(value, [...path, key])
      : [[...path, key].join(".")],
  );

describe("the create page's browser client", () => {
  it("exposes exactly create and resend", () => {
    expect(leaves(registryCreateBrowserContract).sort()).toEqual([
      "registry.admins.resendInvite",
      "registry.shelters.create",
    ]);
  });

  it("uses the contract's own procedures", () => {
    expect(registryCreateBrowserContract.registry.shelters.create).toBe(
      registryContract.registry.shelters.create,
    );
    expect(registryCreateBrowserContract.registry.admins.resendInvite).toBe(
      registryContract.registry.admins.resendInvite,
    );
  });
});
