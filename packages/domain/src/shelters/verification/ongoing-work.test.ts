import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids";
import { EvidenceItemSchema } from "./evidence";
import {
  EvidenceItemInputSchema,
  ongoingWorkRefusalOf,
  toVerificationEvidence,
} from "./evidence-input";
import {
  ONGOING_WORK_ISSUER_MAX_LENGTH,
  ONGOING_WORK_MAX_DOCUMENTS,
  type OngoingWorkDocument,
  ongoingWorkMonthsAt,
  ongoingWorkProblemOf,
} from "./ongoing-work";

const OPERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
/** 24 November 2026 in Kyiv: the oldest month accepted is November 2025. */
const NOW = new Date("2026-11-24T10:00:00.000Z");
const BY = { recordedBy: OPERATOR, recordedAt: NOW };

const receipt = (month: string, issuer = "Ветклініка «Айболить»"): OngoingWorkDocument => ({
  kind: "vet_receipt",
  month,
  issuer,
});

const record = (documents: readonly OngoingWorkDocument[]) => ({
  kind: "ongoing_work_record" as const,
  documents,
  notes: "Чеки на стерилізацію",
});

const recorded = (documents: readonly OngoingWorkDocument[]) =>
  toVerificationEvidence([EvidenceItemInputSchema.parse(record(documents))], BY);

describe("an ongoing-work record: two different months (owner, 2026-11-24)", () => {
  it("refuses one month, one document or two, with the reason the form names", () => {
    expect(recorded([receipt("2026-10")])).toEqual({ kind: "ongoing_work_too_few_months" });
    expect(
      recorded([receipt("2026-10"), { kind: "food_purchase", month: "2026-10", issuer: "Зоо" }]),
    ).toEqual({ kind: "ongoing_work_too_few_months" });
  });

  it("accepts two different months and stores what was seen, dated when recorded", () => {
    const result = recorded([receipt("2026-09"), receipt("2026-10")]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.evidence.items).toEqual([
      {
        ...record([receipt("2026-09"), receipt("2026-10")]),
        checkedAt: NOW,
        checkedBy: OPERATOR,
      },
    ]);
  });

  it("the stored schema states two months too, though the write path is the guard", () => {
    const stored = {
      ...record([receipt("2026-10"), receipt("2026-10")]),
      checkedAt: NOW,
      checkedBy: OPERATOR,
    };
    expect(EvidenceItemSchema.safeParse(stored).success).toBe(false);
    expect(
      EvidenceItemSchema.safeParse({
        ...stored,
        documents: [receipt("2026-09"), receipt("2026-10")],
      }).success,
    ).toBe(true);
  });
});

describe("an ongoing-work record: no future month, none older than 12 months (D3)", () => {
  it("refuses a month after Kyiv's current one", () => {
    expect(recorded([receipt("2026-10"), receipt("2026-12")])).toEqual({
      kind: "ongoing_work_month_in_future",
      month: "2026-12",
    });
  });

  it("takes the current month on Kyiv's calendar, where UTC is still the month before", () => {
    const kyivDecember = new Date("2026-11-30T22:30:00.000Z");
    expect(ongoingWorkProblemOf([receipt("2026-11"), receipt("2026-12")], kyivDecember)).toBe(null);
  });

  it("accepts the month exactly 12 back and refuses the one before it", () => {
    expect(recorded([receipt("2025-11"), receipt("2026-11")]).kind).toBe("ok");
    expect(recorded([receipt("2025-10"), receipt("2026-11")])).toEqual({
      kind: "ongoing_work_month_too_old",
      month: "2025-10",
    });
  });

  it("offers the form exactly the months it accepts, newest first", () => {
    const months = ongoingWorkMonthsAt(NOW);
    expect(months).toHaveLength(13);
    expect(months[0]).toBe("2026-11");
    expect(months.at(-1)).toBe("2025-11");
    expect(months).toContain("2026-01");
    expect(months).toContain("2025-12");
  });
});

/** Owner, 2026-11-24, verbatim: "#573 D3: (a), age counted when the record is made." */
describe("an ongoing-work record's age counts when it is made (D3 (a))", () => {
  const madeAt = (checkedAt: Date, documents: readonly OngoingWorkDocument[]) => ({
    ...record(documents),
    checkedAt,
    checkedBy: OPERATOR,
  });

  it("checks each record at its own checkedAt, never at a later now", () => {
    // Made in October 2025, months 13 and 14 back by now: fine when it was made.
    const old = madeAt(new Date("2025-10-15T10:00:00.000Z"), [
      receipt("2025-09"),
      receipt("2025-10"),
    ]);
    expect(ongoingWorkRefusalOf([old])).toBe(null);
    // The same months stamped now, as a new or edited record is: refused.
    expect(ongoingWorkRefusalOf([old, { ...old, checkedAt: NOW }])).toEqual({
      kind: "ongoing_work_month_too_old",
      month: "2025-09",
    });
    expect(ongoingWorkRefusalOf([madeAt(NOW, [receipt("2026-11")])])).toEqual({
      kind: "ongoing_work_too_few_months",
    });
  });

  it("leaves the months to the caller when asked, and checks them on recording by default", () => {
    const tooOld = [
      EvidenceItemInputSchema.parse(record([receipt("2025-09"), receipt("2025-10")])),
    ];
    expect(toVerificationEvidence(tooOld, BY).kind).toBe("ongoing_work_month_too_old");
    const left = toVerificationEvidence(tooOld, BY, "by_caller");
    expect(left.kind).toBe("ok");
    if (left.kind !== "ok") return;
    // Stamped now, so the caller's own check refuses it unless it is put back from file.
    expect(ongoingWorkRefusalOf(left.evidence.items)?.kind).toBe("ongoing_work_month_too_old");
  });
});

describe("an ongoing-work record's input", () => {
  it("requires the issuer", () => {
    expect(
      EvidenceItemInputSchema.safeParse(record([receipt("2026-09"), receipt("2026-10", "")]))
        .success,
    ).toBe(false);
    const { issuer: _issuer, ...noIssuer } = receipt("2026-10");
    expect(
      EvidenceItemInputSchema.safeParse(record([receipt("2026-09"), noIssuer as never])).success,
    ).toBe(false);
  });

  it("caps the issuer at the same length on input and in the stored schema", () => {
    const at = (length: number) =>
      record([receipt("2026-09"), receipt("2026-10", "a".repeat(length))]);
    const stored = (length: number) => ({ ...at(length), checkedAt: NOW, checkedBy: OPERATOR });
    expect(EvidenceItemInputSchema.safeParse(at(ONGOING_WORK_ISSUER_MAX_LENGTH)).success).toBe(
      true,
    );
    expect(EvidenceItemInputSchema.safeParse(at(ONGOING_WORK_ISSUER_MAX_LENGTH + 1)).success).toBe(
      false,
    );
    expect(EvidenceItemSchema.safeParse(stored(ONGOING_WORK_ISSUER_MAX_LENGTH)).success).toBe(true);
    expect(EvidenceItemSchema.safeParse(stored(ONGOING_WORK_ISSUER_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });

  it("takes only a YYYY-MM month and the four document kinds", () => {
    for (const month of ["2026-13", "2026-9", "2026-09-01", ""]) {
      expect(
        EvidenceItemInputSchema.safeParse(record([receipt("2026-08"), receipt(month)])).success,
      ).toBe(false);
    }
    expect(
      EvidenceItemInputSchema.safeParse(
        record([receipt("2026-08"), { ...receipt("2026-09"), kind: "rent" as never }]),
      ).success,
    ).toBe(false);
  });

  it("needs notes and at most the cap of documents", () => {
    expect(
      EvidenceItemInputSchema.safeParse({
        ...record([receipt("2026-08"), receipt("2026-09")]),
        notes: "",
      }).success,
    ).toBe(false);
    const many = Array.from({ length: ONGOING_WORK_MAX_DOCUMENTS + 1 }, () => receipt("2026-09"));
    expect(EvidenceItemInputSchema.safeParse(record(many)).success).toBe(false);
    expect(EvidenceItemInputSchema.safeParse(record(many.slice(1))).success).toBe(true);
  });
});
