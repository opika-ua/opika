import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids";
import { shelterAvailabilityOf } from "./public-pause";
import { PauseCodeSchema } from "./reasons";
import {
  FEED_VISIBLE_VERIFICATION_STATUSES,
  REACHABLE_VERIFICATION_STATUSES,
  type ShelterVerification,
  VERIFICATION_STATUSES,
} from "./state";

const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const AT = new Date("2026-08-05T00:00:00.000Z");
const EVIDENCE = { items: [], submittedAt: AT };
const verifiedFacts = { verifiedAt: AT, verifiedBy: MODERATOR };
const pausedFacts = {
  ...verifiedFacts,
  pausedAt: AT,
  pausedBy: { kind: "moderator", moderatorId: MODERATOR },
  reason: { code: "relocation", note: "private note" },
} as const;

const states: Record<(typeof VERIFICATION_STATUSES)[number], ShelterVerification> = {
  pending: { status: "pending", submittedAt: AT, evidence: EVIDENCE },
  under_review: {
    status: "under_review",
    startedAt: AT,
    reviewerId: MODERATOR,
    evidence: EVIDENCE,
  },
  verified: { status: "verified", ...verifiedFacts, evidence: EVIDENCE },
  rejected: {
    status: "rejected",
    rejectedAt: AT,
    rejectedBy: MODERATOR,
    reason: { code: "spam", note: null },
    evidence: EVIDENCE,
  },
  paused: { status: "paused", ...pausedFacts, evidence: EVIDENCE },
  suspended: {
    status: "suspended",
    suspendedAt: AT,
    suspendedBy: MODERATOR,
    reason: { code: "unresponsive", note: null },
    priorState: { status: "paused", ...pausedFacts },
    evidence: EVIDENCE,
  },
};

describe("shelterAvailabilityOf", () => {
  it("is open for verified, paused with the closed code for paused, null for every other status", () => {
    for (const status of VERIFICATION_STATUSES) {
      const got = shelterAvailabilityOf(states[status]);
      if (status === "verified") expect(got).toEqual({ kind: "open" });
      else if (status === "paused") expect(got).toEqual({ kind: "paused", reason: "relocation" });
      else expect(got).toBeNull();
    }
  });

  it("does not surface a pause kept in a suspension's priorState", () => {
    expect(shelterAvailabilityOf(states.suspended)).toBeNull();
  });

  it("carries the code only: no note, actor or date", () => {
    const got = shelterAvailabilityOf(states.paused);
    expect(JSON.stringify(got)).not.toContain("private note");
    expect(Object.keys(got ?? {}).sort()).toEqual(["kind", "reason"]);
  });

  it("covers every pause code", () => {
    for (const code of PauseCodeSchema.options) {
      const state: ShelterVerification = {
        status: "paused",
        ...pausedFacts,
        reason: { code, note: null },
        evidence: EVIDENCE,
      };
      expect(shelterAvailabilityOf(state)).toEqual({ kind: "paused", reason: code });
    }
  });

  it("keeps reachable (pages) and feed-visible (gallery) as two facts", () => {
    expect([...REACHABLE_VERIFICATION_STATUSES]).toEqual(["verified", "paused"]);
    expect([...FEED_VISIBLE_VERIFICATION_STATUSES]).toEqual(["verified"]);
    const reachable = VERIFICATION_STATUSES.filter(
      (s) => shelterAvailabilityOf(states[s]) !== null,
    );
    expect(reachable).toEqual([...REACHABLE_VERIFICATION_STATUSES]);
  });
});
