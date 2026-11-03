import { describe, expect, it } from "vitest";
import { ReportDraftSchema } from "./draft";
import { newReport } from "./report";

// Reports are anonymous. Adding any field to Report is a deliberate act that
// must update this list, and so must pass the privacy question it asks.
const REPORT_KEYS = [
  "animalId",
  "comment",
  "createdAt",
  "id",
  "kind",
  "shelterId",
  "status",
] as const;

describe("a report", () => {
  it("carries exactly these fields, and no reporter", () => {
    const report = newReport(ReportDraftSchema.parse({ kind: "scam" }), {
      id: "33333333-3333-4333-8333-333333333333",
      animalId: "44444444-4444-4444-8444-444444444444",
      shelterId: "55555555-5555-4555-8555-555555555555",
      at: new Date("2026-11-01T10:00:00Z"),
    } as Parameters<typeof newReport>[1]);
    expect(Object.keys(report).sort()).toEqual([...REPORT_KEYS]);
  });

  it("lets a draft carry only a kind and a comment", () => {
    expect(Object.keys(ReportDraftSchema.parse({ kind: "other", comment: "x" })).sort()).toEqual([
      "comment",
      "kind",
    ]);
  });
});
