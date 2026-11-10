import { describe, expect, it } from "vitest";
import { CityIdSchema, EdrpouSchema, ModeratorIdSchema } from "../../primitives/ids";
import type { ShelterLegalEntity } from "../legal-entity";
import type { ExactAddress } from "../location";
import type { EvidenceItem, VerificationEvidence } from "./evidence";
import {
  approvalGaps,
  DEFAULT_VERIFICATION_POLICY,
  evidenceGaps,
  meetsEvidenceRequirements,
} from "./policy";

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

const EDRPOU_ITEM: EvidenceItem = {
  kind: "edrpou_registration",
  edrpou: EDRPOU,
  registeredName: "ГО «Тестовий притулок»",
  documentKey: null,
};
const VIDEO_CALL: EvidenceItem = {
  kind: "site_visit",
  visitedAt: AT,
  visitedBy: MODERATOR,
  notes: "Відеодзвінок",
};
const BANK: EvidenceItem = {
  kind: "bank_account_holder",
  holderName: "Тестовий притулок",
  documentKey: null,
};

const FOP: ShelterLegalEntity = { kind: "sole_proprietor", legalName: "ФОП Тест", edrpou: EDRPOU };

describe("evidence requirements", () => {
  it("accepts a registered NGO or a ФОП with registration and one video call", () => {
    for (const entity of [NGO, FOP]) {
      const submitted = evidence([EDRPOU_ITEM, VIDEO_CALL]);
      expect(meetsEvidenceRequirements(entity, submitted, DEFAULT_VERIFICATION_POLICY)).toBe(true);
    }
  });

  it("no longer accepts registration, banking and a reference without a video call", () => {
    for (const entity of [NGO, FOP]) {
      const submitted = evidence([EDRPOU_ITEM, BANK, reference("Ветклініка")]);
      expect(evidenceGaps(entity, submitted, DEFAULT_VERIFICATION_POLICY)).toEqual([
        { kind: "site_visit", minimum: 1, provided: 0 },
      ]);
    }
  });

  it("reports which item a registered form is missing rather than a bare refusal", () => {
    for (const entity of [NGO, FOP]) {
      expect(evidenceGaps(entity, evidence([VIDEO_CALL]), DEFAULT_VERIFICATION_POLICY)).toEqual([
        { kind: "edrpou_registration", minimum: 1, provided: 0 },
      ]);
    }
  });

  it("requires neither banking nor a reference from a registered form", () => {
    for (const entity of [NGO, FOP]) {
      const kinds = evidenceGaps(entity, evidence([]), DEFAULT_VERIFICATION_POLICY).map(
        (gap) => gap.kind,
      );
      expect(kinds).toEqual(["edrpou_registration", "site_visit"]);
    }
  });

  it("lets an unregistered group qualify on one video call and one reference", () => {
    const submitted = evidence([VIDEO_CALL, reference("Ветклініка")]);
    expect(meetsEvidenceRequirements(INITIATIVE, submitted, DEFAULT_VERIFICATION_POLICY)).toBe(
      true,
    );
  });

  it("does not let an unregistered group qualify on references alone", () => {
    const submitted = evidence([reference("Ветклініка"), reference("Сусідня організація")]);
    expect(evidenceGaps(INITIATIVE, submitted, DEFAULT_VERIFICATION_POLICY)).toEqual([
      { kind: "site_visit", minimum: 1, provided: 0 },
    ]);
  });

  it("does not let an unregistered group qualify on a video call alone", () => {
    expect(evidenceGaps(INITIATIVE, evidence([VIDEO_CALL]), DEFAULT_VERIFICATION_POLICY)).toEqual([
      { kind: "reference_contact", minimum: 1, provided: 0 },
    ]);
  });

  it("does not require registration paperwork from an unregistered group", () => {
    const gaps = evidenceGaps(INITIATIVE, evidence([]), DEFAULT_VERIFICATION_POLICY);
    expect(gaps.map((gap) => gap.kind)).not.toContain("edrpou_registration");
  });

  it("refuses an empty submission from every legal form", () => {
    for (const entity of [NGO, FOP, INITIATIVE]) {
      expect(meetsEvidenceRequirements(entity, evidence([]), DEFAULT_VERIFICATION_POLICY)).toBe(
        false,
      );
    }
  });
});

const ADDRESS: ExactAddress = {
  line1: "вул. Тестова, 1",
  line2: null,
  postalCode: null,
  cityId: CityIdSchema.parse("22222222-2222-4222-8222-222222222222"),
  district: null,
  coordinates: null,
};

describe("approval gaps", () => {
  it("lists the missing verified data first, legal details before the address", () => {
    const gaps = approvalGaps(
      { legalEntity: null, exactAddress: null },
      evidence([]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([
      { on: "verified_data", field: "legal_entity" },
      { on: "verified_data", field: "exact_address" },
    ]);
  });

  it("measures no evidence while the legal form is unknown", () => {
    const gaps = approvalGaps(
      { legalEntity: null, exactAddress: ADDRESS },
      evidence([]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([{ on: "verified_data", field: "legal_entity" }]);
  });

  it("follows a missing address with the evidence gaps of the known legal form", () => {
    const gaps = approvalGaps(
      { legalEntity: NGO, exactAddress: null },
      evidence([VIDEO_CALL]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([
      { on: "verified_data", field: "exact_address" },
      { on: "evidence", kind: "edrpou_registration", minimum: 1, provided: 0 },
    ]);
  });

  it("is empty once the data is on file and the evidence suffices, even without a point", () => {
    const gaps = approvalGaps(
      { legalEntity: INITIATIVE, exactAddress: ADDRESS },
      evidence([VIDEO_CALL, reference("Ветклініка")]),
      DEFAULT_VERIFICATION_POLICY,
    );
    expect(gaps).toEqual([]);
  });
});
