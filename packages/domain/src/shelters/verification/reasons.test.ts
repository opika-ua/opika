import { describe, expect, it } from "vitest";
import {
  OfferedRejectionCodeSchema,
  RETIRED_REJECTION_CODES,
  RejectionCodeSchema,
  RejectionReasonSchema,
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
