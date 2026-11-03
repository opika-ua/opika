import { describe, expect, it } from "vitest";
import { type ModeratorId, ModeratorIdSchema } from "../primitives/ids";
import type { Report, ReportStatus } from "./report";
import { decideReport, REPORT_EVENT_TYPES, type ReportEventType } from "./transition";

const moderator = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const other: ModeratorId = ModeratorIdSchema.parse("22222222-2222-4222-8222-222222222222");
const createdAt = new Date("2026-11-01T10:00:00Z");
const later = new Date("2026-11-02T10:00:00Z");

const reportWith = (status: ReportStatus): Report =>
  ({
    id: "33333333-3333-4333-8333-333333333333",
    animalId: "44444444-4444-4444-8444-444444444444",
    shelterId: "55555555-5555-4555-8555-555555555555",
    kind: "scam",
    comment: null,
    createdAt,
    status,
  }) as Report;

const STATES: readonly ReportStatus[] = [
  { kind: "open" },
  { kind: "resolved", at: later, by: other },
  { kind: "dismissed", at: later, by: other },
];

describe("decideReport", () => {
  it("covers every event type", () => {
    expect([...REPORT_EVENT_TYPES].sort()).toEqual(["dismiss", "resolve"]);
  });

  it.each([
    ["resolve", { kind: "resolved", at: later, by: moderator }],
    ["dismiss", { kind: "dismissed", at: later, by: moderator }],
  ] as const)("an open report accepts %s", (type, next) => {
    expect(decideReport(reportWith({ kind: "open" }), { type, at: later, by: moderator })).toEqual({
      kind: "ok",
      next,
    });
  });

  const decided = STATES.filter((s) => s.kind !== "open");
  it.each(decided.flatMap((s) => REPORT_EVENT_TYPES.map((e) => [s, e] as const)))(
    "a %j report refuses %s, whoever asks",
    (status, type: ReportEventType) => {
      expect(decideReport(reportWith(status), { type, at: later, by: moderator })).toEqual({
        kind: "illegal",
        from: status.kind,
        event: type,
      });
    },
  );

  it("refuses an event dated before the report was created", () => {
    const eventAt = new Date("2026-10-31T10:00:00Z");
    expect(
      decideReport(reportWith({ kind: "open" }), { type: "resolve", at: eventAt, by: moderator }),
    ).toEqual({ kind: "non_monotonic", createdAt, eventAt });
  });

  it("accepts an event at exactly the creation instant", () => {
    expect(
      decideReport(reportWith({ kind: "open" }), { type: "dismiss", at: createdAt, by: moderator })
        .kind,
    ).toBe("ok");
  });

  it("checks the state before the clock for a decided report", () => {
    const result = decideReport(reportWith({ kind: "resolved", at: later, by: other }), {
      type: "resolve",
      at: new Date("2026-10-01T00:00:00Z"),
      by: moderator,
    });
    expect(result.kind).toBe("illegal");
  });
});
