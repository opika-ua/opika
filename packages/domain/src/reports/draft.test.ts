import { describe, expect, it } from "vitest";
import { ReportDraftSchema } from "./draft";
import { REPORT_COMMENT_BACKSTOP_DAYS, REPORT_COMMENT_RETENTION_DAYS, REPORT_KINDS } from "./kind";
import { newReport } from "./report";

const OPTIONAL_KINDS = REPORT_KINDS.filter((k) => k !== "other");
const ok = (value: unknown) => ReportDraftSchema.safeParse(value).success;

describe("a report draft", () => {
  it.each(OPTIONAL_KINDS)("%s accepts a missing comment", (kind) => {
    expect(ok({ kind })).toBe(true);
  });

  it("other refuses a missing comment", () => {
    expect(ok({ kind: "other" })).toBe(false);
  });

  it.each(["", "   ", "\n\t "])("other refuses a blank comment %j", (comment) => {
    expect(ok({ kind: "other", comment })).toBe(false);
  });

  it.each(OPTIONAL_KINDS)("%s refuses a blank comment rather than storing it", (kind) => {
    expect(ok({ kind, comment: "   " })).toBe(false);
  });

  it("allows exactly 500 characters and refuses 501", () => {
    expect(ok({ kind: "other", comment: "a".repeat(500) })).toBe(true);
    expect(ok({ kind: "other", comment: "a".repeat(501) })).toBe(false);
  });

  it("trims the comment before counting and keeping it", () => {
    const parsed = ReportDraftSchema.parse({ kind: "photo", comment: `  ${"a".repeat(500)}  ` });
    expect(parsed.comment).toBe("a".repeat(500));
  });

  it("refuses an unknown kind and extra keys", () => {
    expect(ok({ kind: "spam" })).toBe(false);
    expect(ok({ kind: "photo", reporter: "x" })).toBe(false);
  });

  it("keeps the retention window shorter than the backstop", () => {
    expect(REPORT_COMMENT_RETENTION_DAYS).toBe(90);
    expect(REPORT_COMMENT_BACKSTOP_DAYS).toBe(180);
  });
});

describe("newReport", () => {
  const ids = {
    id: "33333333-3333-4333-8333-333333333333",
    animalId: "44444444-4444-4444-8444-444444444444",
    shelterId: "55555555-5555-4555-8555-555555555555",
  } as Parameters<typeof newReport>[1];

  it("starts open, stamped by the caller's clock, with a missing comment stored as null", () => {
    const at = new Date("2026-11-01T10:00:00Z");
    const report = newReport(ReportDraftSchema.parse({ kind: "outdated" }), { ...ids, at });
    expect(report).toMatchObject({ kind: "outdated", comment: null, createdAt: at });
    expect(report.status).toEqual({ kind: "open" });
  });
});
