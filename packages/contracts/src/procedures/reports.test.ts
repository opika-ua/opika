import { REPORT_KINDS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { contract } from "../contract";
import { IllegalTransitionDataSchema } from "../errors";
import { registryContract, registryReportsContract } from "../kabinet";
import { ReportGroupViewSchema, ReportRowViewSchema } from "../kabinet/views";
import { ReportsCreateInputSchema, ReportsCreateOutputSchema } from "./reports";

const animalId = "44444444-4444-4444-8444-444444444444";
const parse = (value: unknown) => ReportsCreateInputSchema.safeParse(value);
const OPTIONAL_KINDS = REPORT_KINDS.filter((k) => k !== "other");

describe("reports.create input", () => {
  it.each(REPORT_KINDS)("accepts a valid %s report with a comment", (kind) => {
    expect(parse({ animalId, kind, comment: "Some words" }).success).toBe(true);
  });

  it.each(OPTIONAL_KINDS)("accepts %s without a comment", (kind) => {
    expect(parse({ animalId, kind }).success).toBe(true);
  });

  it("requires a comment for other, and refuses a whitespace-only one", () => {
    expect(parse({ animalId, kind: "other" }).success).toBe(false);
    expect(parse({ animalId, kind: "other", comment: "   " }).success).toBe(false);
  });

  it("trims the comment and caps it at 500", () => {
    const parsed = parse({ animalId, kind: "photo", comment: "  hi  " });
    expect(parsed.success && parsed.data.comment).toBe("hi");
    expect(parse({ animalId, kind: "photo", comment: "a".repeat(500) }).success).toBe(true);
    expect(parse({ animalId, kind: "photo", comment: "a".repeat(501) }).success).toBe(false);
  });

  it("refuses an unknown kind, a bad animal id and a missing kind", () => {
    expect(parse({ animalId, kind: "spam" }).success).toBe(false);
    expect(parse({ animalId: "nope", kind: "photo" }).success).toBe(false);
    expect(parse({ animalId }).success).toBe(false);
  });

  it("refuses unknown keys, so no reporter detail can ride along", () => {
    expect(parse({ animalId, kind: "photo", email: "a@b.c" }).success).toBe(false);
  });

  it("accepts the honeypot up to 200 characters and refuses more", () => {
    expect(parse({ animalId, kind: "photo", website: "" }).success).toBe(true);
    expect(parse({ animalId, kind: "photo", website: "a".repeat(200) }).success).toBe(true);
    expect(parse({ animalId, kind: "photo", website: "a".repeat(201) }).success).toBe(false);
  });

  it("answers only { ok: true }", () => {
    expect(ReportsCreateOutputSchema.safeParse({ ok: true }).success).toBe(true);
    expect(ReportsCreateOutputSchema.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("report views", () => {
  it("expose no reporter field", () => {
    expect(Object.keys(ReportRowViewSchema.shape).sort()).toEqual([
      "comment",
      "createdAt",
      "id",
      "kind",
    ]);
    expect(Object.keys(ReportGroupViewSchema.shape).sort()).toEqual([
      "animal",
      "openCount",
      "reports",
      "shelter",
    ]);
  });
});

describe("the report procedures are exported but not mounted", () => {
  it("are absent from both contracts until handlers exist", () => {
    expect("reports" in contract).toBe(false);
    expect("reports" in registryContract.registry).toBe(false);
    expect(Object.keys(registryReportsContract).sort()).toEqual(["list", "setStatus"]);
  });
});

describe("IllegalTransitionData", () => {
  it("accepts the report machine's refusal", () => {
    expect(
      IllegalTransitionDataSchema.safeParse({
        machine: "report",
        from: "resolved",
        event: "dismiss",
      }).success,
    ).toBe(true);
  });

  it("refuses an open report as the source, since open can always move", () => {
    expect(
      IllegalTransitionDataSchema.safeParse({ machine: "report", from: "open", event: "resolve" })
        .success,
    ).toBe(false);
  });

  it("still accepts the older machines", () => {
    const listing = { machine: "listing", from: "draft", event: "delete_draft" };
    const verification = { machine: "verification", from: "pending", event: "approve" };
    expect(IllegalTransitionDataSchema.safeParse(listing).success).toBe(true);
    expect(IllegalTransitionDataSchema.safeParse(verification).success).toBe(true);
  });
});
