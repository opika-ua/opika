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
import { withEvidenceOnFile } from "../../../../kabinet/handlers/evidence-on-file";
import { evidenceOfRows } from "../evidence-editor/evidence-rows";
import { resubmitRowsOf } from "./resubmit-evidence";

/**
 * Resubmit's prefill: the evidence on file as R-UI 2's editor holds it. Sent
 * back unedited it goes through the editor's own check (`evidenceOfRows`),
 * the contract's own input schema (never re-implemented here), the domain's
 * own `toVerificationEvidence`, and the server's carry-over of what the input
 * can't send (`withEvidenceOnFile`), and must come out as the items the
 * shelter has, so "no edits" really means "the same".
 */

/** Who made the visit on file: never the operator who resubmits. */
const RECORDER = ModeratorIdSchema.parse("22222222-2222-4222-8222-222222222222");
/** Who resubmits: `toVerificationEvidence` stamps every visit sent with this id. */
const RESUBMITTER = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const RECORDED = new Date("2026-10-17T10:00:00Z");
const SHELTER = "51000000-0000-4000-8000-000000000001";

const SITE_VISIT: EvidenceItem = {
  kind: "site_visit",
  visitedAt: new Date("2026-10-05T00:00:00Z"),
  visitedBy: RECORDER,
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

/**
 * The prefill sent back with no edits: the editor's check, the contract's
 * parse, the domain's rebuild, and the server's carry-over from the record.
 */
const sentBackUnedited = (items: readonly EvidenceItem[]) => {
  const onFile = evidence(items);
  const checked = evidenceOfRows(resubmitRowsOf(onFile), RECORDED);
  if (checked.kind !== "ok") {
    throw new Error(`the editor refused its own prefill: ${JSON.stringify(checked.errors)}`);
  }
  const parsed = resubmitInput.parse({ shelterId: SHELTER, evidence: checked.items });
  const rebuilt = toVerificationEvidence(parsed.evidence, {
    recordedBy: RESUBMITTER,
    recordedAt: RECORDED,
  });
  if (rebuilt.kind !== "ok") throw new Error(`the domain refused the prefill: ${rebuilt.kind}`);
  return { sent: checked.items, resubmitted: withEvidenceOnFile(onFile, rebuilt.evidence) };
};

describe("resubmit prefill", () => {
  it("every item, in order, as the editor's cards (a visit's day as its calendar date)", () => {
    expect(resubmitRowsOf(evidence(ITEMS))).toEqual([
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
    ]);
  });

  it("sent back unedited, passes the editor and the contract, and comes out as the same items", () => {
    const { sent, resubmitted } = sentBackUnedited(ITEMS);
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
    expect(resubmitted).toEqual({ items: ITEMS, submittedAt: RECORDED });
  });

  it("the visit keeps who made it, not who resubmits", () => {
    const visit = sentBackUnedited(ITEMS).resubmitted.items.find(
      (item) => item.kind === "site_visit",
    );
    expect(visit).toMatchObject({ visitedBy: "22222222-2222-4222-8222-222222222222" });
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
    expect(sentBackUnedited([reference]).resubmitted).toEqual({
      items: [reference],
      submittedAt: RECORDED,
    });
  });

  it("a supporting document gets no card (RG-Q5), and the resubmit keeps it, key unchanged", () => {
    const document: EvidenceItem = {
      kind: "supporting_document",
      label: { uk: "Договір оренди приміщення", en: null },
      documentKey: "evidence/abc.pdf",
    };
    const withDocument = [...ITEMS, document];
    expect(resubmitRowsOf(evidence(withDocument)).map((row) => row.kind)).toEqual([
      "edrpou_registration",
      "bank_account_holder",
      "reference_contact",
      "site_visit",
    ]);
    const { sent, resubmitted } = sentBackUnedited(withDocument);
    expect(JSON.stringify(sent)).not.toContain("evidence/");
    expect(resubmitted.items).toContainEqual({
      kind: "supporting_document",
      label: { uk: "Договір оренди приміщення", en: null },
      documentKey: "evidence/abc.pdf",
    });
    expect(resubmitted.items).toEqual(withDocument);
  });

  it("an ЄДРПОУ or bank card has no key field, and the resubmit puts the key back", () => {
    const withKey: EvidenceItem[] = [
      { kind: "bank_account_holder", holderName: "ГО «Хвіст»", documentKey: "evidence/x.pdf" },
    ];
    expect(resubmitRowsOf(evidence(withKey))).toEqual([
      { id: "on-file-0", kind: "bank_account_holder", holderName: "ГО «Хвіст»" },
    ]);
    const { sent, resubmitted } = sentBackUnedited(withKey);
    // Nothing sent carries a key, so `acceptEvidence` can't refuse the resubmit for one.
    expect(JSON.stringify(sent)).not.toContain("evidence/");
    expect(resubmitted.items).toEqual(withKey);
  });

  it("an empty list stays empty", () => {
    expect(resubmitRowsOf(evidence([]))).toEqual([]);
  });
});
