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
 * The public verification copy (/prytulkam §6 and §6b) presents a call as always required only
 * while the policy requires one for some legal form. A call mentioned under a condition («якщо»,
 * «наприклад») is an option, not a requirement. A form requires a call when every other kind of
 * evidence together still falls short.
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
    registry: {
      edrpou: EDRPOU,
      registeredName: "ГО «Лапа»",
      registeredAddress: "м. Київ, вул. Тестова, 1",
    },
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

const FORMS: readonly ShelterLegalEntity[] = [
  { kind: "registered_ngo", legalName: "ГО «Лапа»", edrpou: EDRPOU, registeredAt: AT },
  { kind: "sole_proprietor", legalName: "ФОП", edrpou: EDRPOU },
  { kind: "unregistered_initiative", contactPersonName: "Олена" },
];

const callRequired = (entity: ShelterLegalEntity): boolean =>
  !meetsEvidenceRequirements(
    entity,
    { items: Object.values(EVERY_KIND_BUT_THE_CALL), submittedAt: AT },
    DEFAULT_VERIFICATION_POLICY,
  );

const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const { reference_contact: _reference, ...ALL_BUT_THE_REFERENCE } = EVERY_KIND_BUT_THE_CALL;
const EVERY_KIND_BUT_THE_REFERENCE: EvidenceItem[] = [
  ...Object.values(ALL_BUT_THE_REFERENCE),
  { kind: "site_visit", visitedAt: AT, visitedBy: MODERATOR, notes: "Дзвінок" },
];

const referenceRequired = (entity: ShelterLegalEntity): boolean =>
  !meetsEvidenceRequirements(
    entity,
    { items: EVERY_KIND_BUT_THE_REFERENCE, submittedAt: AT },
    DEFAULT_VERIFICATION_POLICY,
  );

const CALL = /відеодзвін|дзвінок|дзвінк|розмов/i;
const REFERENCE = /рекомендаці/i;
/** A paragraph naming unregistered initiatives scopes every sentence in it to them. */
const INITIATIVES_ONLY = /незареєстрован/i;
const CONDITION = /якщо|наприклад/i;

const callSentences = (text: string): string[] =>
  text.split(/\n+|(?<=[.!?])\s+/).filter((sentence) => CALL.test(sentence));

/** The sentences that name a call with no condition: read as "a call is always part of it". */
const unconditionalCallSentences = (text: string): string[] =>
  callSentences(text).filter((sentence) => !CONDITION.test(sentence));

/** Reference sentences with no condition, outside a paragraph scoped to initiatives: "every form needs one". */
const referenceForEveryForm = (text: string): string[] =>
  text
    .split(/\n+/)
    .filter((paragraph) => !INITIATIVES_ONLY.test(paragraph))
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .filter((sentence) => REFERENCE.test(sentence) && !CONDITION.test(sentence));

const PUBLIC_VERIFICATION_COPY = [
  uk.forShelters.verification,
  uk.forShelters.verificationOpenToVolunteers,
];

describe("/prytulkam §6 against DEFAULT_VERIFICATION_POLICY", () => {
  it("presents a call as always required exactly when the policy requires one for some form", () => {
    const anyFormRequiresACall = FORMS.some(callRequired);
    const unconditional = PUBLIC_VERIFICATION_COPY.flatMap(unconditionalCallSentences);
    if (anyFormRequiresACall) expect(unconditional).not.toEqual([]);
    else expect(unconditional).toEqual([]);
  });

  it("today no legal form needs a call unconditionally (owner, 2026-11-19, (a′))", () => {
    expect(FORMS.filter(callRequired)).toEqual([]);
  });

  /** The live R5 text (owner's, 2026-11-19) offers a call in both §6 and §6b, each under a condition. */
  it("reads the live copy's conditional calls as options, and an unconditional one as a requirement", () => {
    for (const text of PUBLIC_VERIFICATION_COPY) {
      expect(callSentences(text)).not.toEqual([]);
      expect(unconditionalCallSentences(text)).toEqual([]);
    }
    expect(
      unconditionalCallSentences("Незареєстрована ініціатива проходить відеодзвінок."),
    ).toHaveLength(1);
  });

  it("presents a reference as needed by every form only when the policy requires one of every form", () => {
    const unscoped = PUBLIC_VERIFICATION_COPY.flatMap(referenceForEveryForm);
    if (FORMS.every(referenceRequired)) expect(unscoped).not.toEqual([]);
    else expect(unscoped).toEqual([]);
  });

  it("today only an unregistered initiative needs a reference (owner, 2026-11-19, (a′))", () => {
    expect(FORMS.filter(referenceRequired).map((form) => form.kind)).toEqual([
      "unregistered_initiative",
    ]);
  });

  /** Owner, 2026-11-19: §6b asks for a reference, so it must say it is about initiatives. */
  it("§6b names unregistered initiatives, so its reference is scoped to them", () => {
    const text = uk.forShelters.verificationOpenToVolunteers;
    expect(text).toMatch(INITIATIVES_ONLY);
    expect(text).toMatch(REFERENCE);
    expect(referenceForEveryForm(text)).toEqual([]);
    expect(
      referenceForEveryForm(text.replace(/Незареєстровані ініціативи/u, "Притулки")),
    ).not.toEqual([]);
  });
});
