import { describe, expect, it } from "vitest";
import { EdrpouSchema, ModeratorIdSchema } from "../../primitives/ids";
import { EvidenceItemSchema } from "./evidence";
import {
  type EvidenceAttribution,
  type EvidenceItemInput,
  EvidenceItemInputSchema,
  toEvidenceItem,
  toVerificationEvidence,
} from "./evidence-input";

const OPERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const SCRIPT_FOUNDER = ModeratorIdSchema.parse("22222222-2222-4222-8222-222222222222");
/** Late in the UTC day: a slip into a local date would move it on machines east of UTC (CI runs in UTC, so this guards only there). */
const RECORDED_AT = new Date("2026-10-07T23:30:00.000Z");
const BY: EvidenceAttribution = { recordedBy: OPERATOR, recordedAt: RECORDED_AT };
const EDRPOU = EdrpouSchema.parse("12345678");

/** H2-5: required in the stored domain item too, not only at the form. */
describe("EvidenceItemSchema", () => {
  it("requires registeredName on a stored EDRPOU registration", () => {
    expect(
      EvidenceItemSchema.safeParse({
        kind: "edrpou_registration",
        edrpou: "12345678",
        documentKey: null,
      }).success,
    ).toBe(false);
  });
});

describe("EvidenceItemInputSchema", () => {
  it("requires registeredName on an EDRPOU registration", () => {
    expect(
      EvidenceItemInputSchema.safeParse({ kind: "edrpou_registration", edrpou: "12345678" })
        .success,
    ).toBe(false);
  });

  it("requires visitedOn on a site visit, as a calendar date", () => {
    expect(EvidenceItemInputSchema.safeParse({ kind: "site_visit", notes: "Був" }).success).toBe(
      false,
    );
    expect(
      EvidenceItemInputSchema.safeParse({
        kind: "site_visit",
        visitedOn: "2026-10-01T10:00:00Z",
        notes: "Був",
      }).success,
      "an instant is not a calendar date",
    ).toBe(false);
  });

  /** An input file with nothing to attach shouldn't have to say so. */
  it("defaults an absent optional document to null", () => {
    expect(
      EvidenceItemInputSchema.parse({ kind: "bank_account_holder", holderName: "ГО «Лапа»" }),
    ).toEqual({ kind: "bank_account_holder", holderName: "ГО «Лапа»", documentKey: null });
  });

  it("still requires the document on a supporting document", () => {
    expect(
      EvidenceItemInputSchema.safeParse({ kind: "supporting_document", labelUk: "Статут" }).success,
    ).toBe(false);
  });
});

describe("toEvidenceItem", () => {
  const cases: ReadonlyArray<[EvidenceItemInput, unknown]> = [
    [
      {
        kind: "edrpou_registration",
        edrpou: EDRPOU,
        registeredName: "ГО «Лапа»",
        documentKey: null,
      },
      {
        kind: "edrpou_registration",
        edrpou: EDRPOU,
        registeredName: "ГО «Лапа»",
        documentKey: null,
      },
    ],
    [
      { kind: "bank_account_holder", holderName: "ГО «Лапа»", documentKey: "evidence/x.pdf" },
      { kind: "bank_account_holder", holderName: "ГО «Лапа»", documentKey: "evidence/x.pdf" },
    ],
    [
      {
        kind: "reference_contact",
        name: "Ветклініка «Айболить»",
        channel: { kind: "phone", e164: "+380501234567" },
        relationship: "veterinary_clinic",
      },
      {
        kind: "reference_contact",
        name: "Ветклініка «Айболить»",
        channel: { kind: "phone", e164: "+380501234567" },
        relationship: "veterinary_clinic",
      },
    ],
    [
      { kind: "site_visit", visitedOn: "2026-09-30", notes: "Оглянув вольєри" },
      {
        kind: "site_visit",
        visitedAt: new Date("2026-09-30T00:00:00.000Z"),
        visitedBy: OPERATOR,
        notes: "Оглянув вольєри",
      },
    ],
    [
      { kind: "supporting_document", labelUk: "Статут", documentKey: "evidence/statute.pdf" },
      {
        kind: "supporting_document",
        label: { uk: "Статут", en: null },
        documentKey: "evidence/statute.pdf",
      },
    ],
  ];

  for (const [input, expected] of cases) {
    it(`maps ${input.kind} to a valid domain item`, () => {
      const item = toEvidenceItem(input, BY);
      expect(item).toEqual(expected);
      expect(EvidenceItemSchema.parse(item)).toEqual(expected);
    });
  }

  /** Decisions §4: whoever records it vouches for it — the script and the kabinet differ only here. */
  it("credits the visit to whoever is recording it, not to a typed name", () => {
    const visit: EvidenceItemInput = { kind: "site_visit", visitedOn: "2026-09-30", notes: "Був" };
    const fromKabinet = toEvidenceItem(visit, BY);
    const fromScript = toEvidenceItem(visit, {
      recordedBy: SCRIPT_FOUNDER,
      recordedAt: RECORDED_AT,
    });
    expect(fromKabinet.kind === "site_visit" && fromKabinet.visitedBy).toBe(OPERATOR);
    expect(fromScript.kind === "site_visit" && fromScript.visitedBy).toBe(SCRIPT_FOUNDER);
  });
});

describe("toVerificationEvidence", () => {
  it("stamps the bundle with when it was recorded", () => {
    const result = toVerificationEvidence(
      [{ kind: "site_visit", visitedOn: "2026-10-07", notes: "Сьогодні" }],
      BY,
    );
    expect(result).toEqual({
      kind: "ok",
      evidence: {
        items: [
          {
            kind: "site_visit",
            visitedAt: new Date("2026-10-07T00:00:00.000Z"),
            visitedBy: OPERATOR,
            notes: "Сьогодні",
          },
        ],
        submittedAt: RECORDED_AT,
      },
    });
  });

  it("refuses a site visit dated after the day it is recorded", () => {
    expect(
      toVerificationEvidence(
        [{ kind: "site_visit", visitedOn: "2026-10-08", notes: "Завтра" }],
        BY,
      ),
    ).toEqual({ kind: "site_visit_in_future", visitedOn: "2026-10-08" });
  });
});
