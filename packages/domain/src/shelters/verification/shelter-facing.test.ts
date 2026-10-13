import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids";
import { ShelterFacingVerificationSchema, shelterFacingVerificationOf } from "./shelter-facing";
import type { ShelterVerification } from "./state";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const AT = new Date("2026-10-01T00:00:00.000Z");
const EARLIER = new Date("2026-06-01T00:00:00.000Z");
/** Recognisable, so a leak of either into the projection would show up in its JSON. */
const EVIDENCE = {
  items: [
    {
      kind: "reference_contact" as const,
      name: "SECRET-REFERENCE-NAME",
      channel: { kind: "phone" as const, e164: "+380501234567" },
      relationship: "veterinary_clinic" as const,
    },
  ],
  submittedAt: EARLIER,
};

const STATES: ShelterVerification[] = [
  { status: "pending", submittedAt: AT, evidence: EVIDENCE },
  { status: "under_review", startedAt: AT, reviewerId: MOD, evidence: EVIDENCE },
  { status: "verified", verifiedAt: AT, verifiedBy: MOD, evidence: EVIDENCE },
  {
    status: "paused",
    verifiedAt: EARLIER,
    verifiedBy: MOD,
    pausedAt: AT,
    pausedBy: { kind: "moderator", moderatorId: MOD },
    reason: { code: "seasonal_closure", note: null },
    evidence: EVIDENCE,
  },
  {
    status: "rejected",
    rejectedAt: AT,
    rejectedBy: MOD,
    reason: { code: "insufficient_evidence", note: "Бракує другої рекомендації" },
    evidence: EVIDENCE,
  },
  {
    status: "suspended",
    suspendedAt: AT,
    suspendedBy: MOD,
    reason: { code: "unresponsive", note: null },
    priorState: { status: "verified", verifiedAt: EARLIER, verifiedBy: MOD },
    evidence: EVIDENCE,
  },
];

describe("shelterFacingVerificationOf", () => {
  for (const state of STATES) {
    it(`shows a ${state.status} shelter its status and reason, never the evidence or a moderator id`, () => {
      const projected = shelterFacingVerificationOf(state);
      expect(ShelterFacingVerificationSchema.parse(projected)).toEqual(projected);
      expect(projected.status).toBe(state.status);
      const json = JSON.stringify(projected);
      expect(json).not.toContain(MOD);
      expect(json).not.toContain("SECRET-REFERENCE-NAME");
      expect(projected).not.toHaveProperty("evidence");
    });
  }

  /** K5 shows what the operator wrote, word for word. */
  it("carries a rejection's note verbatim", () => {
    const rejected = STATES.find((s) => s.status === "rejected") as ShelterVerification;
    expect(shelterFacingVerificationOf(rejected)).toEqual({
      status: "rejected",
      at: AT,
      reason: { code: "insufficient_evidence", note: "Бракує другої рекомендації" },
    });
  });

  it("dates a paused shelter from the pause, not the original verification", () => {
    const paused = STATES.find((s) => s.status === "paused") as ShelterVerification;
    expect(shelterFacingVerificationOf(paused)).toMatchObject({ since: AT });
  });
});
