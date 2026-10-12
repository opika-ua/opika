import { describe, expect, it } from "vitest";
import { EVIDENCE_KINDS, EvidenceItemSchema } from "./evidence";

describe("EVIDENCE_KINDS", () => {
  /**
   * `satisfies` only proves every listed kind exists; it can't catch a kind
   * added to the union and left off this list. `EvidenceGap.kind` and the
   * EVIDENCE_INSUFFICIENT error are built on this list, so a missing kind
   * would be a gap the operator could never be told about.
   */
  it("names every variant of the evidence union, and nothing else", () => {
    const unionKinds = EvidenceItemSchema.options.map((option) => option.shape.kind.value);
    expect([...EVIDENCE_KINDS].sort()).toEqual([...unionKinds].sort());
  });

  it("is pinned literally, so the list changes only by a deliberate edit", () => {
    expect(EVIDENCE_KINDS).toEqual([
      "edrpou_registration",
      "bank_account_holder",
      "reference_contact",
      "site_visit",
      "supporting_document",
    ]);
  });
});
