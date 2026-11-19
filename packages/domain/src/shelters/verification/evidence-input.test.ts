import { describe, expect, it } from "vitest";
import { EdrpouSchema, ModeratorIdSchema } from "../../primitives/ids";
import { EvidenceItemSchema } from "./evidence";
import {
  EVIDENCE_DOCUMENT_KEY_MAX_LENGTH,
  EVIDENCE_NAME_MAX_LENGTH,
  EVIDENCE_NOTES_MAX_LENGTH,
  type EvidenceAttribution,
  type EvidenceItemInput,
  EvidenceItemInputSchema,
  isSiteVisitInFuture,
  OPEN_SOURCES_MAX_PAGES,
  toEvidenceItem,
  toVerificationEvidence,
} from "./evidence-input";

const OPERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const SCRIPT_FOUNDER = ModeratorIdSchema.parse("22222222-2222-4222-8222-222222222222");
/** Late in the UTC day, already the 8th in Kyiv (01:30 or 02:30): "today" is Kyiv's. */
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

describe("EvidenceItemInputSchema: open sources", () => {
  const check = (patch: Record<string, unknown> = {}) => ({
    kind: "open_sources_review",
    registry: {
      edrpou: "12345678",
      registeredName: "ГО «Лапа»",
      registeredAddress: "м. Київ, вул. Тестова, 1",
    },
    pages: ["https://lapa.example.org/"],
    notes: "Сайт веде організація",
    checkedOn: "2026-10-01",
    ...patch,
  });

  it("accepts a check with no reviews, as null", () => {
    expect(EvidenceItemInputSchema.parse(check())).toMatchObject({ reviews: null });
  });

  it("a registry part is never weaker than a registration: a valid code, the name and the address", () => {
    const registry = (patch: Record<string, unknown>) =>
      check({ registry: { ...check().registry, ...patch } });
    expect(EvidenceItemInputSchema.safeParse(registry({ edrpou: "1234" })).success).toBe(false);
    expect(EvidenceItemInputSchema.safeParse(registry({ registeredName: "" })).success).toBe(false);
    expect(EvidenceItemInputSchema.safeParse(registry({ registeredAddress: "" })).success).toBe(
      false,
    );
    expect(
      EvidenceItemInputSchema.safeParse(registry({ registeredAddress: undefined })).success,
    ).toBe(false);
  });

  it("takes no registry part at all, as null (an initiative has no ЄДР entry)", () => {
    const { registry: _registry, ...noRegistry } = check();
    expect(EvidenceItemInputSchema.parse(noRegistry)).toMatchObject({ registry: null });
    expect(EvidenceItemInputSchema.parse(check({ registry: null }))).toMatchObject({
      registry: null,
    });
  });

  it("needs at least one https page and at most the cap", () => {
    expect(EvidenceItemInputSchema.safeParse(check({ pages: [] })).success).toBe(false);
    expect(
      EvidenceItemInputSchema.safeParse(check({ pages: ["http://lapa.example.org/"] })).success,
    ).toBe(false);
    expect(EvidenceItemInputSchema.safeParse(check({ pages: ["lapa.example.org"] })).success).toBe(
      false,
    );
    const pages = (n: number) => Array.from({ length: n }, (_, i) => `https://e.example.org/${i}`);
    expect(
      EvidenceItemInputSchema.safeParse(check({ pages: pages(OPEN_SOURCES_MAX_PAGES) })).success,
    ).toBe(true);
    expect(
      EvidenceItemInputSchema.safeParse(check({ pages: pages(OPEN_SOURCES_MAX_PAGES + 1) }))
        .success,
    ).toBe(false);
  });

  it("stores each page as its canonical href, never as typed", () => {
    for (const typed of ["https:lapa.example.org", "https:/lapa.example.org"]) {
      const parsed = EvidenceItemInputSchema.parse(check({ pages: [typed] }));
      expect(parsed).toMatchObject({ pages: ["https://lapa.example.org/"] });
    }
    expect(
      EvidenceItemInputSchema.parse(check({ pages: ["https://Lapa.Example.org/a b"] })),
    ).toMatchObject({ pages: ["https://lapa.example.org/a%20b"] });
  });

  it("refuses a page with another protocol or no host", () => {
    for (const typed of ["http:lapa.example.org", "javascript:alert(1)", "https://", "/relative"]) {
      expect(EvidenceItemInputSchema.safeParse(check({ pages: [typed] })).success, typed).toBe(
        false,
      );
    }
  });

  it("needs the note and a calendar date", () => {
    expect(EvidenceItemInputSchema.safeParse(check({ notes: "" })).success).toBe(false);
    expect(
      EvidenceItemInputSchema.safeParse(check({ checkedOn: "2026-10-01T10:00:00Z" })).success,
    ).toBe(false);
  });
});

describe("EvidenceItemInputSchema text bounds", () => {
  const at = (n: number) => "я".repeat(n);

  it("accepts text at the limit and refuses one character more", () => {
    const holder = (holderName: string) => ({ kind: "bank_account_holder", holderName });
    expect(EvidenceItemInputSchema.safeParse(holder(at(EVIDENCE_NAME_MAX_LENGTH))).success).toBe(
      true,
    );
    expect(
      EvidenceItemInputSchema.safeParse(holder(at(EVIDENCE_NAME_MAX_LENGTH + 1))).success,
    ).toBe(false);

    const visit = (notes: string) => ({ kind: "site_visit", visitedOn: "2026-10-01", notes });
    expect(EvidenceItemInputSchema.safeParse(visit(at(EVIDENCE_NOTES_MAX_LENGTH))).success).toBe(
      true,
    );
    expect(
      EvidenceItemInputSchema.safeParse(visit(at(EVIDENCE_NOTES_MAX_LENGTH + 1))).success,
    ).toBe(false);
  });

  it("bounds a document key", () => {
    const doc = (documentKey: string) => ({
      kind: "supporting_document",
      labelUk: "Довідка",
      documentKey,
    });
    expect(
      EvidenceItemInputSchema.safeParse(doc("k".repeat(EVIDENCE_DOCUMENT_KEY_MAX_LENGTH))).success,
    ).toBe(true);
    expect(
      EvidenceItemInputSchema.safeParse(doc("k".repeat(EVIDENCE_DOCUMENT_KEY_MAX_LENGTH + 1)))
        .success,
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
      {
        kind: "open_sources_review",
        registry: {
          edrpou: EDRPOU,
          registeredName: "ГО «Лапа»",
          registeredAddress: "м. Київ, вул. Тестова, 1",
        },
        pages: ["https://lapa.example.org/", "https://www.facebook.com/lapa"],
        reviews: "Відгуки в Google",
        notes: "Сайт і сторінка ведуться з 2022 року",
        checkedOn: "2026-09-30",
      },
      {
        kind: "open_sources_review",
        registry: {
          edrpou: EDRPOU,
          registeredName: "ГО «Лапа»",
          registeredAddress: "м. Київ, вул. Тестова, 1",
        },
        pages: ["https://lapa.example.org/", "https://www.facebook.com/lapa"],
        reviews: "Відгуки в Google",
        notes: "Сайт і сторінка ведуться з 2022 року",
        checkedAt: new Date("2026-09-30T00:00:00.000Z"),
        checkedBy: OPERATOR,
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

  /** Decisions §4: whoever records it vouches for it - the script and the kabinet differ only here. */
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
        [{ kind: "site_visit", visitedOn: "2026-10-09", notes: "Завтра" }],
        BY,
      ),
    ).toEqual({ kind: "site_visit_in_future", visitedOn: "2026-10-09" });
  });

  it("refuses an open-sources check dated after the day it is recorded, on Kyiv's calendar", () => {
    const check = (checkedOn: string): EvidenceItemInput => ({
      kind: "open_sources_review",
      registry: {
        edrpou: EDRPOU,
        registeredName: "ГО «Лапа»",
        registeredAddress: "м. Київ, вул. Тестова, 1",
      },
      pages: ["https://lapa.example.org/"],
      reviews: null,
      notes: "Перевірив",
      checkedOn,
    });
    // RECORDED_AT is already the 8th in Kyiv.
    expect(toVerificationEvidence([check("2026-10-08")], BY).kind).toBe("ok");
    expect(toVerificationEvidence([check("2026-10-09")], BY)).toEqual({
      kind: "open_sources_check_in_future",
      checkedOn: "2026-10-09",
    });
  });
});

/**
 * Kyiv's calendar, not UTC's (Oleksii, 2026-10-17: "the site-visit "not in
 * the future" check uses the Kyiv calendar date, not UTC"). Each instant is
 * at least an hour from a Kyiv midnight under either offset (UTC+2 in
 * winter, UTC+3 in summer), so the cases hold whatever the time-zone data
 * says about daylight saving.
 */
describe("a site visit's date, on Kyiv's calendar", () => {
  const visit = (visitedOn: string): EvidenceItemInput => ({
    kind: "site_visit",
    visitedOn,
    notes: "Оглянув вольєри",
  });
  const at = (iso: string): EvidenceAttribution => ({
    recordedBy: OPERATOR,
    recordedAt: new Date(iso),
  });

  it.each([
    ["October", "2026-10-07T22:30:00.000Z", "2026-10-08", "2026-10-09"],
    ["December", "2026-12-01T22:30:00.000Z", "2026-12-02", "2026-12-03"],
  ])(
    "accepts Kyiv's today just after local midnight while UTC's date is still yesterday (%s), and refuses tomorrow",
    (_month, recordedAt, kyivToday, kyivTomorrow) => {
      expect(new Date(recordedAt).toISOString().slice(0, 10) < kyivToday).toBe(true);
      expect(toVerificationEvidence([visit(kyivToday)], at(recordedAt)).kind).toBe("ok");
      expect(isSiteVisitInFuture(kyivToday, new Date(recordedAt))).toBe(false);
      expect(isSiteVisitInFuture(kyivTomorrow, new Date(recordedAt))).toBe(true);
      expect(toVerificationEvidence([visit(kyivTomorrow)], at(recordedAt))).toEqual({
        kind: "site_visit_in_future",
        visitedOn: kyivTomorrow,
      });
    },
  );

  it("refuses tomorrow late in Kyiv's evening, when UTC is the same day", () => {
    const evening = at("2026-10-08T19:30:00.000Z");
    expect(toVerificationEvidence([visit("2026-10-08")], evening).kind).toBe("ok");
    expect(toVerificationEvidence([visit("2026-10-09")], evening)).toEqual({
      kind: "site_visit_in_future",
      visitedOn: "2026-10-09",
    });
  });
});
