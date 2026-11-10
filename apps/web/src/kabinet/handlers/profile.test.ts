import { makeShelter } from "@opika/db/test";
import { EARLY_LISTING_DAYS, type ShelterVerification } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { kabinetShelterViewOf } from "./profile";

/** The shelter's view of its early listing as a pure mapping (gap 6); the route: `../handlers.test.ts`. */

const SINCE = new Date("2026-09-01T10:00:00Z");
const END = new Date(SINCE.getTime() + EARLY_LISTING_DAYS * 86_400_000);
const AT = new Date("2026-08-20T10:00:00Z");
const MOD = "11111111-1111-4111-8111-111111111111" as never;
const evidence = { items: [], submittedAt: AT };

const viewAt = (verification: ShelterVerification, since: Date | null, now: Date) =>
  kabinetShelterViewOf(makeShelter({ verification, earlyListingSince: since }), now).earlyListing;

const pending: ShelterVerification = { status: "pending", submittedAt: AT, evidence };

describe("kabinetShelterViewOf: earlyListing", () => {
  it("runs until the instant before the end, ends at it (the public gate's strict boundary)", () => {
    expect(viewAt(pending, SINCE, new Date(END.getTime() - 1))).toEqual({
      kind: "running",
      expiresAt: END,
    });
    expect(viewAt(pending, SINCE, END)).toEqual({ kind: "ended", endedAt: END });
  });

  it("is ended under review too, long after the end", () => {
    const underReview: ShelterVerification = {
      status: "under_review",
      startedAt: AT,
      reviewerId: MOD,
      evidence,
    };
    expect(viewAt(underReview, SINCE, new Date(END.getTime() + 30 * 86_400_000))).toEqual({
      kind: "ended",
      endedAt: END,
    });
  });

  it("is none once the decision is made, whatever stale value is stored", () => {
    const verified: ShelterVerification = {
      status: "verified",
      verifiedAt: AT,
      verifiedBy: MOD,
      evidence,
    };
    const rejected: ShelterVerification = {
      status: "rejected",
      rejectedAt: AT,
      rejectedBy: MOD,
      reason: { code: "spam", note: null },
      evidence,
    };
    for (const verification of [verified, rejected]) {
      expect(viewAt(verification, SINCE, END), verification.status).toEqual({ kind: "none" });
      expect(viewAt(verification, SINCE, SINCE), verification.status).toEqual({ kind: "none" });
    }
  });

  it("is none when it was never allowed", () => {
    expect(viewAt(pending, null, END)).toEqual({ kind: "none" });
  });
});
