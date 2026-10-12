import { kabinetContract } from "@opika/contracts";
import { describe, expect, it } from "vitest";

/**
 * S3-Q2 (Oleksii): shelter A's member acting on shelter B's animal or shelter
 * gets FORBIDDEN, for every shelter-scoped procedure, confirm and undoConfirm
 * included. These must call the real handlers, so they arrive with the
 * handlers slice; until then each one is a visible `todo` in every run
 * (S3-Q3). PR #85 stays draft until every todo here is a real test, with the
 * ownership-filter breakage in its mutation list.
 *
 * The list is hand-written; the one real test below fails if a shelter.*
 * procedure is added to the contract without a cross-tenant entry here.
 */
const SHELTER_SCOPED_PROCEDURES = [
  "shelter.profile.get",
  "shelter.profile.updateContact",
  "shelter.profile.updateFreshnessSentence",
  "shelter.profile.proposeDonation",
  "shelter.profile.cancelDonationProposal",
  "shelter.profile.pause",
  "shelter.profile.resume",
  "shelter.verification.requestReview",
  "shelter.animals.list",
  "shelter.animals.byId",
  "shelter.animals.createDraft",
  "shelter.animals.update",
  "shelter.animals.transition",
  "shelter.animals.confirm",
  "shelter.animals.undoConfirm",
  "shelter.animals.deleteDraft",
] as const;

const pathsOf = (node: object, prefix: string): readonly string[] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = `${prefix}.${key}`;
    return value !== null && Object.getPrototypeOf(value) === Object.prototype
      ? pathsOf(value as object, path)
      : [path];
  });

describe("cross-tenant access to shelter-scoped procedures", () => {
  it("has an entry for every shelter.* procedure in the contract", () => {
    expect([...SHELTER_SCOPED_PROCEDURES].sort()).toEqual(
      [...pathsOf(kabinetContract.shelter, "shelter")].sort(),
    );
  });

  for (const procedure of SHELTER_SCOPED_PROCEDURES) {
    it.todo(`cross-tenant: ${procedure}`);
  }
});
