import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids.js";
import type { VerificationEvidence } from "./evidence.js";
import {
  enteredAt,
  FEED_VISIBLE_VERIFICATION_STATUSES,
  isPubliclyVerified,
  type ShelterVerification,
  ShelterVerificationSchema,
  VERIFICATION_STATUSES,
} from "./state.js";

const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const AT = new Date("2026-08-05T00:00:00.000Z");
const OTHER = new Date("2026-01-01T00:00:00.000Z");
const EVIDENCE: VerificationEvidence = { items: [], submittedAt: OTHER };

const states: Record<string, ShelterVerification> = {
  pending: { status: "pending", submittedAt: AT, evidence: EVIDENCE },
  under_review: {
    status: "under_review",
    startedAt: AT,
    reviewerId: MODERATOR,
    evidence: EVIDENCE,
  },
  verified: { status: "verified", verifiedAt: AT, verifiedBy: MODERATOR, evidence: EVIDENCE },
  rejected: {
    status: "rejected",
    rejectedAt: AT,
    rejectedBy: MODERATOR,
    reason: { code: "spam", note: null },
    evidence: EVIDENCE,
  },
  suspended: {
    status: "suspended",
    suspendedAt: AT,
    suspendedBy: MODERATOR,
    reason: { code: "unresponsive", note: null },
    priorStatus: "verified",
    evidence: EVIDENCE,
  },
};

describe("enteredAt", () => {
  // Read directly here rather than only through transition(), where a wrong
  // field can hide behind fixtures that share a timestamp.
  for (const status of VERIFICATION_STATUSES) {
    it(`reads the ${status} state's own timestamp`, () => {
      const state = states[status];
      if (state === undefined) throw new Error(`missing fixture for ${status}`);
      expect(enteredAt(state)).toEqual(AT);
      // Not the evidence timestamp, which is the nearby field to grab by mistake.
      expect(enteredAt(state)).not.toEqual(OTHER);
    });
  }
});

describe("isPubliclyVerified", () => {
  it("is true only for a verified shelter", () => {
    for (const status of VERIFICATION_STATUSES) {
      const state = states[status];
      if (state === undefined) throw new Error(`missing fixture for ${status}`);
      expect(isPubliclyVerified(state)).toBe(status === "verified");
    }
  });

  it("excludes a suspended shelter, which is the reason the function exists", () => {
    const suspended = states.suspended;
    if (suspended === undefined) throw new Error("missing fixture");
    expect(isPubliclyVerified(suspended)).toBe(false);
  });

  it("agrees with the constant the query layer will use", () => {
    // These two must not drift: the predicate runs in TypeScript, the constant
    // becomes an IN list in SQL, and they decide the same thing.
    for (const status of VERIFICATION_STATUSES) {
      const state = states[status];
      if (state === undefined) throw new Error(`missing fixture for ${status}`);
      expect(isPubliclyVerified(state)).toBe(
        (FEED_VISIBLE_VERIFICATION_STATUSES as readonly string[]).includes(status),
      );
    }
  });
});

describe("ShelterVerificationSchema", () => {
  it("requires priorStatus on a suspended state", () => {
    const { priorStatus: _dropped, ...withoutPrior } = states.suspended as Extract<
      ShelterVerification,
      { status: "suspended" }
    >;
    expect(ShelterVerificationSchema.safeParse(withoutPrior).success).toBe(false);
  });

  it("rejects a suspension claiming a prior status other than verified", () => {
    expect(
      ShelterVerificationSchema.safeParse({ ...states.suspended, priorStatus: "pending" }).success,
    ).toBe(false);
  });

  it("has a fixture for every variant it defines", () => {
    expect(Object.keys(states).sort()).toEqual([...VERIFICATION_STATUSES].sort());
  });
});
