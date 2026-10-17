import { registryContract } from "@opika/contracts";
import {
  type ContactChannel,
  type EvidenceItem,
  ModeratorIdSchema,
  toVerificationEvidence,
  type VerificationEvidence,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { evidenceOfRows } from "../evidence-editor/evidence-rows";
import { resubmitPrefillOf } from "./resubmit-evidence";

/**
 * Resubmit's prefill: the evidence on file as R-UI 2's editor holds it. Sent
 * back unedited it goes through the editor's own check (`evidenceOfRows`),
 * the contract's own input schema (never re-implemented here) and the
 * domain's own `toVerificationEvidence`, which must rebuild the same items
 * the shelter has, so "no edits" really means "the same".
 */

const OPERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const RECORDED = new Date("2026-10-17T10:00:00Z");
const SHELTER = "51000000-0000-4000-8000-000000000001";

const SITE_VISIT: EvidenceItem = {
  kind: "site_visit",
  visitedAt: new Date("2026-10-05T00:00:00Z"),
  visitedBy: OPERATOR,
  notes: "Приміщення на вул. Мечникова, 18 собак і 6 котів.",
};
const ITEMS: EvidenceItem[] = [
  {
    kind: "edrpou_registration",
    edrpou: "43902117" as never,
    registeredName: "ГО «Ірпінський хвіст»",
    documentKey: null,
  },
  { kind: "bank_account_holder", holderName: "ГО «Ірпінський хвіст»", documentKey: null },
  {
    kind: "reference_contact",
    name: "Д-р Марина Шевчук",
    channel: { kind: "phone", e164: "+380505552108" },
    relationship: "veterinary_clinic",
  },
  SITE_VISIT,
];
const evidence = (items: readonly EvidenceItem[]): VerificationEvidence => ({
  items,
  submittedAt: new Date("2026-10-04T09:00:00Z"),
});

const resubmitInput = (
  registryContract.registry.verification.resubmit as unknown as {
    "~orpc": { inputSchema: z.ZodType<{ evidence: Parameters<typeof toVerificationEvidence>[0] }> };
  }
)["~orpc"].inputSchema;

/** The prefill sent back with no edits: the editor's check, the contract's parse, the domain's rebuild. */
const sentBackUnedited = (items: readonly EvidenceItem[]) => {
  const checked = evidenceOfRows(resubmitPrefillOf(evidence(items)).rows, RECORDED);
  if (checked.kind !== "ok") {
    throw new Error(`the editor refused its own prefill: ${JSON.stringify(checked.errors)}`);
  }
  const parsed = resubmitInput.parse({ shelterId: SHELTER, evidence: checked.items });
  return {
    sent: checked.items,
    rebuilt: toVerificationEvidence(parsed.evidence, {
      recordedBy: OPERATOR,
      recordedAt: RECORDED,
    }),
  };
};

describe("resubmit prefill", () => {
  it("every item, in order, as the editor's cards (a visit's day as its calendar date)", () => {
    expect(resubmitPrefillOf(evidence(ITEMS))).toEqual({
      rows: [
        {
          id: "on-file-0",
          kind: "edrpou_registration",
          edrpou: "43902117",
          registeredName: "ГО «Ірпінський хвіст»",
        },
        { id: "on-file-1", kind: "bank_account_holder", holderName: "ГО «Ірпінський хвіст»" },
        {
          id: "on-file-2",
          kind: "reference_contact",
          name: "Д-р Марина Шевчук",
          channelKind: "phone",
          channelValue: "+380505552108",
          relationship: "veterinary_clinic",
        },
        {
          id: "on-file-3",
          kind: "site_visit",
          visitedOn: "2026-10-05",
          notes: "Приміщення на вул. Мечникова, 18 собак і 6 котів.",
        },
      ],
      leftOut: [],
    });
  });

  it("sent back unedited, passes the editor and the contract, and rebuilds the same items", () => {
    const { sent, rebuilt } = sentBackUnedited(ITEMS);
    // Transcribed from ITEMS, as the contract takes them (`documentKey` defaults to null there).
    expect(sent).toEqual([
      { kind: "edrpou_registration", edrpou: "43902117", registeredName: "ГО «Ірпінський хвіст»" },
      { kind: "bank_account_holder", holderName: "ГО «Ірпінський хвіст»" },
      {
        kind: "reference_contact",
        name: "Д-р Марина Шевчук",
        channel: { kind: "phone", e164: "+380505552108" },
        relationship: "veterinary_clinic",
      },
      {
        kind: "site_visit",
        visitedOn: "2026-10-05",
        notes: "Приміщення на вул. Мечникова, 18 собак і 6 котів.",
      },
    ]);
    expect(rebuilt).toEqual({ kind: "ok", evidence: { items: ITEMS, submittedAt: RECORDED } });
  });

  it.each<[string, ContactChannel]>([
    ["phone", { kind: "phone", e164: "+380505552108" }],
    ["viber", { kind: "viber", e164: "+380671112233" }],
    ["telegram", { kind: "telegram", handle: "vet_irpin" }],
    ["email", { kind: "email", address: "vet@example.org" }],
    ["website", { kind: "website", url: "https://vet.example.org/kontakty" }],
  ])("a reference reached by %s comes back as the same channel", (_kind, channel) => {
    const reference: EvidenceItem = {
      kind: "reference_contact",
      name: "Ветклініка «Айболить»",
      channel,
      relationship: "veterinary_clinic",
    };
    expect(sentBackUnedited([reference]).rebuilt).toEqual({
      kind: "ok",
      evidence: { items: [reference], submittedAt: RECORDED },
    });
  });

  it("leaves out a supporting document (RG-Q5: no document can be sent), saying which", () => {
    const withDocument: EvidenceItem[] = [
      ...ITEMS,
      {
        kind: "supporting_document",
        label: { uk: "Договір оренди приміщення", en: null },
        documentKey: "evidence/abc.pdf",
      },
    ];
    const prefill = resubmitPrefillOf(evidence(withDocument));
    expect(prefill.rows.map((row) => row.kind)).toEqual([
      "edrpou_registration",
      "bank_account_holder",
      "reference_contact",
      "site_visit",
    ]);
    expect(prefill.leftOut).toEqual([
      { kind: "supporting_document", label: "Договір оренди приміщення" },
    ]);
    // What goes back is the four items alone: after it, the document is gone from the record.
    expect(sentBackUnedited(withDocument).rebuilt).toEqual({
      kind: "ok",
      evidence: { items: ITEMS, submittedAt: RECORDED },
    });
  });

  it("drops a document key from an ЄДРПОУ or bank item, keeping its facts, and says so", () => {
    const withKey: EvidenceItem[] = [
      { kind: "bank_account_holder", holderName: "ГО «Хвіст»", documentKey: "evidence/x.pdf" },
    ];
    const prefill = resubmitPrefillOf(evidence(withKey));
    expect(prefill.rows).toEqual([
      { id: "on-file-0", kind: "bank_account_holder", holderName: "ГО «Хвіст»" },
    ]);
    expect(prefill.leftOut).toEqual([{ kind: "document_key", of: "bank_account_holder" }]);
    // Nothing sent carries a key, so `acceptEvidence` can't refuse the resubmit for one.
    expect(JSON.stringify(sentBackUnedited(withKey).sent)).not.toContain("evidence/");
  });

  it("an empty list stays empty", () => {
    expect(resubmitPrefillOf(evidence([]))).toEqual({ rows: [], leftOut: [] });
  });
});
