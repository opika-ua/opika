import {
  DEFAULT_VERIFICATION_POLICY,
  EdrpouSchema,
  type EvidenceItem,
  type EvidenceKind,
  ModeratorIdSchema,
  meetsEvidenceRequirements,
  type ShelterLegalEntity,
} from "@opika/domain";
import { uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";

/**
 * /prytulkam §6 names a video call for a legal form only while the policy requires one: a call is
 * required when every other kind of evidence together still falls short.
 */
const AT = new Date("2026-01-01T00:00:00.000Z");
const EDRPOU = EdrpouSchema.parse("12345678");
const EVERY_KIND_BUT_THE_CALL: Record<Exclude<EvidenceKind, "site_visit">, EvidenceItem> = {
  edrpou_registration: {
    kind: "edrpou_registration",
    edrpou: EDRPOU,
    registeredName: "ГО «Лапа»",
    documentKey: null,
  },
  bank_account_holder: { kind: "bank_account_holder", holderName: "ГО «Лапа»", documentKey: null },
  reference_contact: {
    kind: "reference_contact",
    name: "Ветклініка",
    channel: { kind: "phone", e164: "+380501234567" },
    relationship: "veterinary_clinic",
  },
  open_sources_review: {
    kind: "open_sources_review",
    edrpou: EDRPOU,
    registeredName: "ГО «Лапа»",
    registeredAddress: "м. Київ, вул. Тестова, 1",
    pages: ["https://lapa.example.org/"],
    reviews: null,
    notes: "Сайт",
    checkedAt: AT,
    checkedBy: ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111"),
  },
  public_link: { kind: "public_link", url: "https://lapa.example.org/" },
  supporting_document: {
    kind: "supporting_document",
    label: { uk: "Статут", en: null },
    documentKey: "evidence/statute.pdf",
  },
};

const callRequired = (entity: ShelterLegalEntity): boolean =>
  !meetsEvidenceRequirements(
    entity,
    { items: Object.values(EVERY_KIND_BUT_THE_CALL), submittedAt: AT },
    DEFAULT_VERIFICATION_POLICY,
  );

const paragraph = (start: string): string => {
  const found = uk.forShelters.verification.split("\n\n").find((p) => p.startsWith(start));
  if (found === undefined) throw new Error(`§6 has no paragraph starting «${start}»`);
  return found;
};

describe("/prytulkam §6 against DEFAULT_VERIFICATION_POLICY", () => {
  it.each<[string, ShelterLegalEntity]>([
    [
      "Зареєстрована організація",
      { kind: "registered_ngo", legalName: "ГО «Лапа»", edrpou: EDRPOU, registeredAt: AT },
    ],
    ["Зареєстрована організація", { kind: "sole_proprietor", legalName: "ФОП", edrpou: EDRPOU }],
    ["Незареєстрована ініціатива", { kind: "unregistered_initiative", contactPersonName: "Олена" }],
  ])("«%s…» names a video call exactly when the policy requires one", (start, entity) => {
    expect(paragraph(start).includes("відеодзвін")).toBe(callRequired(entity));
  });
});
