import { describe, expect, it } from "vitest";
import { EdrpouSchema, ModeratorIdSchema } from "../../primitives/ids";
import type { ContactChannel } from "../contact";
import { VERIFICATION_EVENT_TYPES } from "./events";
import type { EvidenceItem, VerificationEvidence } from "./evidence";
import {
  addEvidence,
  EVIDENCE_OPEN_STATUSES,
  evidenceDuplicateKey,
  MAX_EVIDENCE_ITEMS,
} from "./evidence-add";
import { DEFAULT_VERIFICATION_POLICY, evidenceGaps } from "./policy";
import { type ShelterVerification, VERIFICATION_STATUSES } from "./state";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const OTHER_MOD = ModeratorIdSchema.parse("22222222-2222-4222-8222-222222222222");
const T0 = new Date("2026-01-01T00:00:00.000Z");
const VISIT = new Date("2026-03-10T00:00:00.000Z");

const edrpou = (code = "12345678", registeredName = "Лапа"): EvidenceItem => ({
  kind: "edrpou_registration",
  edrpou: EdrpouSchema.parse(code),
  registeredName,
  documentKey: null,
});
const bank = (holderName = "ГО Лапа"): EvidenceItem => ({
  kind: "bank_account_holder",
  holderName,
  documentKey: null,
});
const ref = (
  e164 = "+380501234567",
  name = "Клініка",
  relationship: "veterinary_clinic" | "other" = "veterinary_clinic",
): EvidenceItem => ({
  kind: "reference_contact",
  name,
  channel: { kind: "phone", e164 },
  relationship,
});
const visit = (visitedAt = VISIT, notes = "Були", visitedBy = MOD): EvidenceItem => ({
  kind: "site_visit",
  visitedAt,
  visitedBy,
  notes,
});

const evidence = (items: EvidenceItem[]): VerificationEvidence => ({ items, submittedAt: T0 });

const pending = (items: EvidenceItem[] = []): ShelterVerification => ({
  status: "pending",
  submittedAt: T0,
  evidence: evidence(items),
});
const underReview = (items: EvidenceItem[] = []): ShelterVerification => ({
  status: "under_review",
  startedAt: T0,
  reviewerId: OTHER_MOD,
  evidence: evidence(items),
});

const stateOf = (status: ShelterVerification["status"]): ShelterVerification => {
  const e = evidence([ref()]);
  switch (status) {
    case "pending":
      return pending([ref()]);
    case "under_review":
      return underReview([ref()]);
    case "verified":
      return { status, verifiedAt: T0, verifiedBy: MOD, evidence: e };
    case "rejected":
      return {
        status,
        rejectedAt: T0,
        rejectedBy: MOD,
        reason: { code: "insufficient_evidence", note: null },
        evidence: e,
      };
    case "paused":
      return {
        status,
        verifiedAt: T0,
        verifiedBy: MOD,
        pausedAt: T0,
        pausedBy: { kind: "moderator", moderatorId: MOD },
        reason: { code: "seasonal_closure", note: null },
        evidence: e,
      };
    case "suspended":
      return {
        status,
        suspendedAt: T0,
        suspendedBy: MOD,
        reason: { code: "unresponsive", note: null },
        priorState: { status: "verified", verifiedAt: T0, verifiedBy: MOD },
        evidence: e,
      };
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
};

describe("addEvidence: where it is allowed", () => {
  it.each([
    ["pending", pending([ref()])],
    ["under_review", underReview([ref()])],
  ])("appends in order from %s and changes nothing else", (_name, state) => {
    const before = structuredClone(state);
    const result = addEvidence(state, [edrpou(), bank()]);
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    expect(result.next.evidence.items.map((i) => i.kind)).toEqual([
      "reference_contact",
      "edrpou_registration",
      "bank_account_holder",
    ]);
    expect(result.added.map((i) => i.kind)).toEqual(["edrpou_registration", "bank_account_holder"]);
    // Status, timestamps, reviewer and the evidence stamp are exactly as they were.
    expect({ ...result.next, evidence: undefined }).toEqual({ ...state, evidence: undefined });
    expect(result.next.evidence.submittedAt).toBe(state.evidence.submittedAt);
    expect(state).toEqual(before);
  });

  it("refuses every other status and names it", () => {
    const closed = VERIFICATION_STATUSES.filter(
      (s) => !(EVIDENCE_OPEN_STATUSES as readonly string[]).includes(s),
    );
    expect(closed).toHaveLength(4);
    for (const status of closed) {
      expect(addEvidence(stateOf(status), [edrpou()])).toEqual({ kind: "not_open", from: status });
    }
  });

  it("is not a verification event: the FSM's event list does not name it", () => {
    expect(VERIFICATION_EVENT_TYPES).toEqual([
      "start_review",
      "approve",
      "reject",
      "resubmit",
      "suspend",
      "reinstate",
      "pause",
      "resume",
    ]);
  });
});

describe("addEvidence: duplicates (same kind + same key field, notes ignored)", () => {
  it("edrpou: same code is a duplicate even with another registered name; another code is new", () => {
    const state = pending([edrpou("12345678", "Лапа")]);
    expect(addEvidence(state, [edrpou("12345678", "Інша назва")])).toEqual({ kind: "nothing_new" });
    expect(addEvidence(state, [edrpou("87654321", "Лапа")]).kind).toBe("ok");
  });

  it("bank holder: same name (trim, case) is a duplicate; a different name is new", () => {
    const state = pending([bank("ГО Лапа")]);
    expect(addEvidence(state, [bank("  го лапа ")])).toEqual({ kind: "nothing_new" });
    expect(addEvidence(state, [bank("ГО Лапа допомоги")]).kind).toBe("ok");
  });

  it("reference: same phone is a duplicate whatever the name or relationship; another phone is new", () => {
    const state = pending([ref("+380501234567", "Клініка", "veterinary_clinic")]);
    expect(addEvidence(state, [ref("+380501234567", "Інша особа", "other")])).toEqual({
      kind: "nothing_new",
    });
    expect(addEvidence(state, [ref("+380507654321", "Клініка")]).kind).toBe("ok");
  });

  it("reference: the same value on another channel kind is not a duplicate", () => {
    const state = pending([ref("+380501234567")]);
    const viber: EvidenceItem = {
      kind: "reference_contact",
      name: "Клініка",
      channel: { kind: "viber", e164: "+380501234567" },
      relationship: "veterinary_clinic",
    };
    expect(addEvidence(state, [viber]).kind).toBe("ok");
  });

  it("reference: WhatsApp and Viber with one number, form and website with one URL, are distinct", () => {
    const reference = (channel: ContactChannel): EvidenceItem => ({
      kind: "reference_contact",
      name: "Клініка",
      channel,
      relationship: "veterinary_clinic",
    });
    const url = "https://vet.example/anketa";
    const state = pending([
      reference({ kind: "viber", e164: "+380501234567" }),
      reference({ kind: "website", url }),
    ]);
    const whatsapp = reference({ kind: "whatsapp", e164: "+380501234567" });
    const form = reference({ kind: "form", url });
    expect(evidenceDuplicateKey(whatsapp)).not.toBe(
      evidenceDuplicateKey(reference({ kind: "viber", e164: "+380501234567" })),
    );
    expect(evidenceDuplicateKey(form)).not.toBe(
      evidenceDuplicateKey(reference({ kind: "website", url })),
    );
    expect(addEvidence(state, [whatsapp, form]).kind).toBe("ok");
    expect(addEvidence(pending([whatsapp, form]), [whatsapp, form])).toEqual({
      kind: "nothing_new",
    });
  });

  it("reference: Instagram (any case) and Facebook repeat as duplicates", () => {
    const reference = (channel: ContactChannel): EvidenceItem => ({
      kind: "reference_contact",
      name: "Клініка",
      channel,
      relationship: "veterinary_clinic",
    });
    const state = pending([
      reference({ kind: "instagram", handle: "vet.clinic" }),
      reference({ kind: "facebook", url: "https://www.facebook.com/vet.clinic" }),
    ]);
    expect(
      addEvidence(state, [
        reference({ kind: "instagram", handle: "VET.clinic" }),
        reference({ kind: "facebook", url: "https://www.facebook.com/vet.clinic" }),
      ]),
    ).toEqual({ kind: "nothing_new" });
    expect(addEvidence(state, [reference({ kind: "instagram", handle: "other.vet" })]).kind).toBe(
      "ok",
    );
  });

  it("site visit: same date is a duplicate whatever the notes or recorder; another date with the same notes is new", () => {
    const state = pending([visit(VISIT, "Були")]);
    expect(addEvidence(state, [visit(VISIT, "Зовсім інші нотатки", OTHER_MOD)])).toEqual({
      kind: "nothing_new",
    });
    const next = addEvidence(state, [visit(new Date("2026-03-11T00:00:00.000Z"), "Були")]);
    expect(next.kind).toBe("ok");
  });

  it("a different kind with a lookalike key is never a duplicate", () => {
    expect(evidenceDuplicateKey(bank("12345678"))).not.toBe(
      evidenceDuplicateKey(edrpou("12345678")),
    );
  });

  it("drops a repeat inside the same call, keeping the first", () => {
    const result = addEvidence(pending(), [
      edrpou("12345678", "Перша"),
      edrpou("12345678", "Друга"),
    ]);
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({ registeredName: "Перша" });
  });

  it("is idempotent: repeating the same call adds nothing the second time", () => {
    const first = addEvidence(pending(), [edrpou(), visit()]);
    if (first.kind !== "ok") throw new Error("expected ok");
    expect(addEvidence(first.next, [edrpou(), visit()])).toEqual({ kind: "nothing_new" });
  });
});

describe("addEvidence: the cap on file", () => {
  const filler = (n: number): EvidenceItem[] =>
    Array.from({ length: n }, (_, i) => ref(`+3805000000${String(i).padStart(2, "0")}`));

  it("accepts exactly up to the limit and refuses one over, reporting both numbers", () => {
    expect(addEvidence(pending(filler(MAX_EVIDENCE_ITEMS - 1)), [edrpou()]).kind).toBe("ok");
    expect(addEvidence(pending(filler(MAX_EVIDENCE_ITEMS)), [edrpou()])).toEqual({
      kind: "too_many",
      limit: MAX_EVIDENCE_ITEMS,
      wouldBe: MAX_EVIDENCE_ITEMS + 1,
    });
  });

  it("counts only what is actually new against the cap", () => {
    expect(addEvidence(pending(filler(MAX_EVIDENCE_ITEMS)), [ref("+380500000000")])).toEqual({
      kind: "nothing_new",
    });
  });

  it("is pinned at 30", () => {
    expect(MAX_EVIDENCE_ITEMS).toBe(30);
  });
});

describe("addEvidence: the approval check reads the new list", () => {
  it("a gap on the old list is closed once the missing evidence is added", () => {
    const entity = { kind: "unregistered_initiative", contactPersonName: "Олена" } as const;
    const gapsOf = (v: ShelterVerification) =>
      evidenceGaps(entity, v.evidence, DEFAULT_VERIFICATION_POLICY);
    const before = pending([ref()]);
    expect(gapsOf(before).length).toBeGreaterThan(0);
    const result = addEvidence(before, [visit(), ref("+380507654321")]);
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(gapsOf(result.next)).toEqual([]);
  });
});
