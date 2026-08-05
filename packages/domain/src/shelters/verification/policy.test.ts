import { describe, expect, it } from "vitest";
import { EdrpouSchema, ModeratorIdSchema } from "../../primitives/ids.js";
import type { ShelterLegalEntity } from "../legal-entity.js";
import type { EvidenceItem, VerificationEvidence } from "./evidence.js";
import { DEFAULT_VERIFICATION_POLICY, evidenceGaps, meetsEvidenceRequirements } from "./policy.js";

const AT = new Date("2026-01-01T00:00:00.000Z");
const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const EDRPOU = EdrpouSchema.parse("12345678");

const evidence = (items: readonly EvidenceItem[]): VerificationEvidence => ({
  items,
  submittedAt: AT,
});

const reference = (name: string): EvidenceItem => ({
  kind: "reference_contact",
  name,
  channel: { kind: "phone", e164: "+380501234567" },
  relationship: "veterinary_clinic",
});

const NGO: ShelterLegalEntity = {
  kind: "registered_ngo",
  legalName: "Тестовий притулок",
  edrpou: EDRPOU,
  registeredAt: AT,
};

const INITIATIVE: ShelterLegalEntity = {
  kind: "unregistered_initiative",
  contactPersonName: "Оксана",
};

describe("evidence requirements", () => {
  it("accepts a registered NGO with registration, banking and one reference", () => {
    const submitted = evidence([
      { kind: "edrpou_registration", edrpou: EDRPOU, documentKey: "docs/ngo.pdf" },
      { kind: "bank_account_holder", holderName: "Тестовий притулок", documentKey: null },
      reference("Ветклініка"),
    ]);

    expect(meetsEvidenceRequirements(NGO, submitted, DEFAULT_VERIFICATION_POLICY)).toBe(true);
  });

  it("reports which document an NGO is missing rather than a bare refusal", () => {
    const submitted = evidence([
      { kind: "edrpou_registration", edrpou: EDRPOU, documentKey: null },
    ]);

    expect(evidenceGaps(NGO, submitted, DEFAULT_VERIFICATION_POLICY)).toEqual([
      { kind: "bank_account_holder", minimum: 1, provided: 0 },
      { kind: "reference_contact", minimum: 1, provided: 0 },
    ]);
  });

  it("lets an unregistered group qualify on a site visit and two references", () => {
    const submitted = evidence([
      { kind: "site_visit", visitedAt: AT, visitedBy: MODERATOR, notes: "Відвідано" },
      reference("Ветклініка"),
      reference("Сусідня організація"),
    ]);

    expect(meetsEvidenceRequirements(INITIATIVE, submitted, DEFAULT_VERIFICATION_POLICY)).toBe(
      true,
    );
  });

  it("does not let an unregistered group qualify on a single reference", () => {
    const submitted = evidence([
      { kind: "site_visit", visitedAt: AT, visitedBy: MODERATOR, notes: "Відвідано" },
      reference("Ветклініка"),
    ]);

    expect(evidenceGaps(INITIATIVE, submitted, DEFAULT_VERIFICATION_POLICY)).toEqual([
      { kind: "reference_contact", minimum: 2, provided: 1 },
    ]);
  });

  it("does not require registration paperwork from an unregistered group", () => {
    const gaps = evidenceGaps(INITIATIVE, evidence([]), DEFAULT_VERIFICATION_POLICY);
    expect(gaps.map((gap) => gap.kind)).not.toContain("edrpou_registration");
  });

  it("refuses an empty submission from every legal form", () => {
    for (const entity of [NGO, INITIATIVE]) {
      expect(meetsEvidenceRequirements(entity, evidence([]), DEFAULT_VERIFICATION_POLICY)).toBe(
        false,
      );
    }
  });
});
