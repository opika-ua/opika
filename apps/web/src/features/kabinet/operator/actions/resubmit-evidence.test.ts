import { registryContract } from "@opika/contracts";
import {
  type EvidenceItem,
  ModeratorIdSchema,
  toVerificationEvidence,
  type VerificationEvidence,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { resubmitPrefillOf } from "./resubmit-evidence";

/**
 * Resubmit's prefill: the evidence on file as the editor and the contract
 * take it. Checked by the contract's own input schema (never re-implemented
 * here) and by the domain's own `toVerificationEvidence`, which must rebuild
 * the same items the shelter has, so "no edits" really means "the same".
 */

const OPERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const RECORDED = new Date("2026-10-17T10:00:00Z");

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
    "~orpc": { inputSchema: z.ZodType };
  }
)["~orpc"].inputSchema;

describe("resubmit prefill", () => {
  it("every item, in order, as the editor takes it (a visit's day as its calendar date)", () => {
    expect(resubmitPrefillOf(evidence(ITEMS))).toEqual({
      items: [
        {
          kind: "edrpou_registration",
          edrpou: "43902117",
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
        {
          kind: "site_visit",
          visitedOn: "2026-10-05",
          notes: "Приміщення на вул. Мечникова, 18 собак і 6 котів.",
        },
      ],
      leftOut: [],
    });
  });

  it("passes the contract's own resubmit input schema", () => {
    const { items } = resubmitPrefillOf(evidence(ITEMS));
    const parsed = resubmitInput.safeParse({
      shelterId: "51000000-0000-4000-8000-000000000001",
      evidence: items,
    });
    expect(parsed.success).toBe(true);
  });

  it("sent back unedited, rebuilds the same items the shelter has", () => {
    const { items } = resubmitPrefillOf(evidence(ITEMS));
    const rebuilt = toVerificationEvidence(items, { recordedBy: OPERATOR, recordedAt: RECORDED });
    expect(rebuilt).toEqual({ kind: "ok", evidence: { items: ITEMS, submittedAt: RECORDED } });
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
    expect(prefill.items.map((item) => item.kind)).not.toContain("supporting_document");
    expect(prefill.items).toHaveLength(4);
    expect(prefill.leftOut).toEqual([
      { kind: "supporting_document", label: "Договір оренди приміщення" },
    ]);
  });

  it("drops a document key from an ЄДРПОУ or bank item, keeping its facts, and says so", () => {
    const prefill = resubmitPrefillOf(
      evidence([
        { kind: "bank_account_holder", holderName: "ГО «Хвіст»", documentKey: "evidence/x.pdf" },
      ]),
    );
    expect(prefill.items).toEqual([
      { kind: "bank_account_holder", holderName: "ГО «Хвіст»", documentKey: null },
    ]);
    expect(prefill.leftOut).toEqual([{ kind: "document_key", of: "bank_account_holder" }]);
    // Nothing sent carries a key, so `acceptEvidence` can't refuse the resubmit for one.
    expect(JSON.stringify(prefill.items)).not.toContain("evidence/");
  });

  it("an empty list stays empty", () => {
    expect(resubmitPrefillOf(evidence([]))).toEqual({ items: [], leftOut: [] });
  });
});
