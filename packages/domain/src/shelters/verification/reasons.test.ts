import { describe, expect, it } from "vitest";
import {
  OfferedRejectionCodeSchema,
  OfferedSuspensionCodeSchema,
  RETIRED_REJECTION_CODES,
  RejectionCodeSchema,
  RejectionReasonSchema,
  SuspensionCodeSchema,
  SuspensionReasonSchema,
} from "./reasons";

describe("retired rejection codes", () => {
  it("are no longer offered, and every other code still is", () => {
    const offered: string[] = OfferedRejectionCodeSchema.options;
    for (const code of RejectionCodeSchema.options) {
      const retired = (RETIRED_REJECTION_CODES as readonly string[]).includes(code);
      expect(offered.includes(code)).toBe(!retired);
    }
    expect(offered).toEqual([
      "insufficient_evidence",
      "identity_unverifiable",
      "duplicate_submission",
      "spam",
      "other",
    ]);
    expect(OfferedRejectionCodeSchema.safeParse("out_of_service_area").success).toBe(false);
  });

  it("still parse as stored values, so old records stay readable", () => {
    expect(RejectionCodeSchema.parse("out_of_service_area")).toBe("out_of_service_area");
    expect(
      RejectionReasonSchema.parse({ code: "out_of_service_area", note: "Поза межами" }).code,
    ).toBe("out_of_service_area");
  });
});

describe("retired suspension codes", () => {
  it("offer cannot_confirm_details and not suspected_fraud", () => {
    expect(OfferedSuspensionCodeSchema.options).toEqual([
      "unresponsive",
      "complaint_upheld",
      "listing_quality",
      "cannot_confirm_details",
      "other",
    ]);
    expect(OfferedSuspensionCodeSchema.safeParse("suspected_fraud").success).toBe(false);
  });

  it("still parse suspected_fraud as a stored value", () => {
    expect(SuspensionCodeSchema.parse("suspected_fraud")).toBe("suspected_fraud");
    expect(SuspensionReasonSchema.parse({ code: "suspected_fraud", note: "x" }).code).toBe(
      "suspected_fraud",
    );
  });
});
