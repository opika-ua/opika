import { type EvidenceItem, ModeratorIdSchema, type VerificationEvidence } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { withEvidenceOnFile } from "./evidence-on-file";

/**
 * Resubmit's carry-over, as a pure function: what the operator's input can't
 * send (a document, who made a visit) comes back from the record on file
 * (his round-2b answer 1, "No data loss"; AW-R3-11 for the visit). The same
 * rule through the served router is in `../registry.test.ts`.
 */

const RECORDER = ModeratorIdSchema.parse("0ec0ec0e-0000-4000-8000-000000000099");
const SECOND_RECORDER = ModeratorIdSchema.parse("0ec0ec0e-0000-4000-8000-000000000098");
/** Who resubmits: `toEvidenceItem` stamps every visit sent with this id. */
const RESUBMITTER = ModeratorIdSchema.parse("0ec0ec0e-0000-4000-8000-000000000001");
const ON_FILE_AT = new Date("2026-10-04T09:00:00Z");
const SENT_AT = new Date("2026-10-17T10:00:00Z");

const DOCUMENT: EvidenceItem = {
  kind: "supporting_document",
  label: { uk: "Статут", en: null },
  documentKey: "evidence/abc-statut.pdf",
};
const REFERENCE: EvidenceItem = {
  kind: "reference_contact",
  name: "Ветклініка «Айболить»",
  channel: { kind: "phone", e164: "+380505552108" },
  relationship: "veterinary_clinic",
};
const visit = (by: typeof RECORDER, notes = "Чисто, вольєри з навісом."): EvidenceItem => ({
  kind: "site_visit",
  visitedAt: new Date("2026-10-01T00:00:00Z"),
  visitedBy: by,
  notes,
});
const onFile = (...items: EvidenceItem[]): VerificationEvidence => ({
  items,
  submittedAt: ON_FILE_AT,
});
const sent = (...items: EvidenceItem[]): VerificationEvidence => ({ items, submittedAt: SENT_AT });

describe("withEvidenceOnFile (resubmit)", () => {
  it("text typed back trimmed still matches what the script stored untrimmed (delta review, finding 2)", () => {
    // The onboarding script stores notes and names as written; the editor trims what it sends.
    const scriptVisit = visit(RECORDER, "Був на місці\n");
    const scriptEdrpou: EvidenceItem = {
      kind: "edrpou_registration",
      edrpou: "12345678",
      registeredName: "ГО «Лапа» ",
      documentKey: "evidence/edrpou.pdf",
    };
    expect(
      withEvidenceOnFile(
        onFile(scriptVisit, scriptEdrpou),
        sent(visit(RESUBMITTER, "Був на місці"), {
          kind: "edrpou_registration",
          edrpou: "12345678",
          registeredName: "ГО «Лапа»",
          documentKey: null,
        }),
      ),
    ).toEqual({ items: [scriptVisit, scriptEdrpou], submittedAt: SENT_AT });
  });

  it("no edits: the document stays with its key, and the visit keeps who recorded it", () => {
    expect(
      withEvidenceOnFile(
        onFile(REFERENCE, DOCUMENT, visit(RECORDER)),
        sent(REFERENCE, visit(RESUBMITTER)),
      ),
    ).toEqual({
      items: [
        REFERENCE,
        visit(RECORDER),
        {
          kind: "supporting_document",
          label: { uk: "Статут", en: null },
          documentKey: "evidence/abc-statut.pdf",
        },
      ],
      submittedAt: SENT_AT,
    });
  });

  it("with edits: the edits apply, a removed card stays removed, and the document stays", () => {
    const edited: EvidenceItem = { ...REFERENCE, name: "Ветклініка «Айболить», д-р Шевчук" };
    const result = withEvidenceOnFile(
      onFile(REFERENCE, DOCUMENT, visit(RECORDER), { ...REFERENCE, name: "Громада" }),
      sent(edited, visit(RESUBMITTER)),
    );
    expect(result.items).toEqual([edited, visit(RECORDER), DOCUMENT]);
  });

  it("a changed visit (same day, other notes) is the resubmitting operator's", () => {
    const changed = visit(RESUBMITTER, "Чисто. Вольєри з навісом, 18 собак.");
    expect(withEvidenceOnFile(onFile(visit(RECORDER)), sent(changed)).items).toEqual([changed]);
  });

  it("a new visit is the resubmitting operator's, beside the one on file", () => {
    const later: EvidenceItem = {
      kind: "site_visit",
      visitedAt: new Date("2026-10-15T00:00:00Z"),
      visitedBy: RESUBMITTER,
      notes: "Повторний візит.",
    };
    expect(
      withEvidenceOnFile(onFile(visit(RECORDER)), sent(visit(RESUBMITTER), later)).items,
    ).toEqual([visit(RECORDER), later]);
  });

  it("two identical visits by two people keep both recorders", () => {
    expect(
      withEvidenceOnFile(
        onFile(visit(RECORDER), visit(SECOND_RECORDER)),
        sent(visit(RESUBMITTER), visit(RESUBMITTER)),
      ).items,
    ).toEqual([visit(RECORDER), visit(SECOND_RECORDER)]);
  });

  it("pairs a visit read back from JSONB, keys reordered", () => {
    const fromJsonb = {
      notes: "Чисто, вольєри з навісом.",
      visitedBy: RECORDER,
      kind: "site_visit",
      visitedAt: new Date("2026-10-01T00:00:00Z"),
    } as EvidenceItem;
    expect(withEvidenceOnFile(onFile(fromJsonb), sent(visit(RESUBMITTER))).items).toEqual([
      visit(RECORDER),
    ]);
  });

  it("an ЄДРПОУ item holding a key gets it back when its facts come back unchanged", () => {
    const withKey: EvidenceItem = {
      kind: "edrpou_registration",
      edrpou: "43902117" as never,
      registeredName: "ГО «Хвіст»",
      documentKey: "evidence/edr.pdf",
    };
    expect(
      withEvidenceOnFile(onFile(withKey), sent({ ...withKey, documentKey: null })).items,
    ).toEqual([withKey]);
  });

  it("a bank item holding a key whose facts were edited is kept whole beside the edit", () => {
    const withKey: EvidenceItem = {
      kind: "bank_account_holder",
      holderName: "ГО «Хвіст»",
      documentKey: "evidence/bank.pdf",
    };
    const edited: EvidenceItem = {
      kind: "bank_account_holder",
      holderName: "ГО «Хвіст і лапи»",
      documentKey: null,
    };
    expect(withEvidenceOnFile(onFile(withKey), sent(edited)).items).toEqual([edited, withKey]);
  });

  it("nothing on file: what was sent, as sent", () => {
    expect(withEvidenceOnFile(onFile(), sent(REFERENCE, visit(RESUBMITTER)))).toEqual(
      sent(REFERENCE, visit(RESUBMITTER)),
    );
  });
});
