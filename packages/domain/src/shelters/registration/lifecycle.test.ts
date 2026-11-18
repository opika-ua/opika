import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids";
import { EARLY_LISTING_DAYS, type EarlyListing } from "../verification/early-listing";
import type { VerificationEvidence } from "../verification/evidence";
import { type ShelterVerification, VERIFICATION_STATUSES } from "../verification/state";
import {
  checkDraftCap,
  donationProposalGateOf,
  draftCapOf,
  lifecycleOf,
  publishGateOf,
  type ShelterLifecycle,
} from "./lifecycle";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const NOW = new Date("2026-12-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const EVIDENCE: VerificationEvidence = { items: [], submittedAt: NOW };
const NONE: EarlyListing = { kind: "not_allowed" };

const stateOf = (status: ShelterVerification["status"]): ShelterVerification => {
  switch (status) {
    case "application":
      return { status, appliedAt: NOW, evidence: EVIDENCE };
    case "pending":
      return { status, submittedAt: NOW, evidence: EVIDENCE };
    case "under_review":
      return { status, startedAt: NOW, reviewerId: MOD, evidence: EVIDENCE };
    case "verified":
      return { status, verifiedAt: NOW, verifiedBy: MOD, evidence: EVIDENCE };
    case "rejected":
      return {
        status,
        rejectedAt: NOW,
        rejectedBy: MOD,
        reason: { code: "spam", note: null },
        stage: "application",
        evidence: EVIDENCE,
      };
    case "paused":
      return {
        status,
        verifiedAt: NOW,
        verifiedBy: MOD,
        pausedAt: NOW,
        pausedBy: { kind: "moderator", moderatorId: MOD },
        reason: { code: "relocation", note: null },
        evidence: EVIDENCE,
      };
    case "suspended":
      return {
        status,
        suspendedAt: NOW,
        suspendedBy: MOD,
        reason: { code: "unresponsive", note: null },
        priorState: { status: "verified", verifiedAt: NOW, verifiedBy: MOD },
        evidence: EVIDENCE,
      };
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
};

describe("lifecycleOf", () => {
  it("carries the application's date and email status", () => {
    expect(lifecycleOf(stateOf("application"), NONE, "unconfirmed", NOW)).toEqual({
      stage: "application",
      appliedAt: NOW,
      email: "unconfirmed",
    });
  });

  it("shows how many days of early listing are left (owner, P0-1 reminder)", () => {
    const since = new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 5) * DAY);
    expect(
      lifecycleOf(stateOf("pending"), { kind: "allowed", since }, "confirmed", NOW),
    ).toMatchObject({ stage: "listed_unverified", since, daysLeft: 5, remind: true });
  });

  it("is unlisted once the period has run out, and says so", () => {
    const since = new Date(NOW.getTime() - EARLY_LISTING_DAYS * DAY);
    expect(lifecycleOf(stateOf("pending"), { kind: "allowed", since }, "confirmed", NOW)).toEqual({
      stage: "unlisted_unverified",
      why: "expired",
    });
    expect(lifecycleOf(stateOf("under_review"), NONE, "confirmed", NOW)).toEqual({
      stage: "unlisted_unverified",
      why: "not_allowed",
    });
  });

  it("says which step a rejection refused", () => {
    expect(lifecycleOf(stateOf("rejected"), NONE, "confirmed", NOW)).toEqual({
      stage: "rejected",
      refused: "application",
    });
  });
});

describe("the application's restrictions (D2, D5, §5)", () => {
  const lifecycles: ShelterLifecycle[] = VERIFICATION_STATUSES.map((status) =>
    lifecycleOf(stateOf(status), NONE, "confirmed", NOW),
  );

  it("blocks publishing and donation proposals in an application only", () => {
    for (const lifecycle of lifecycles) {
      const expected =
        lifecycle.stage === "application"
          ? { kind: "blocked", why: "application" }
          : { kind: "open" };
      expect(publishGateOf(lifecycle)).toEqual(expected);
      expect(donationProposalGateOf(lifecycle)).toEqual(expected);
    }
  });

  it("caps drafts at 30 in an application only", () => {
    for (const lifecycle of lifecycles) {
      expect(draftCapOf(lifecycle)).toEqual(
        lifecycle.stage === "application" ? { kind: "capped", max: 30 } : { kind: "uncapped" },
      );
    }
  });

  it("refuses the 31st draft, not the 30th", () => {
    const cap = draftCapOf(lifecycleOf(stateOf("application"), NONE, "confirmed", NOW));
    expect(checkDraftCap(cap, 29)).toEqual({ kind: "ok" });
    expect(checkDraftCap(cap, 30)).toEqual({ kind: "cap_reached", max: 30 });
    expect(checkDraftCap({ kind: "uncapped" }, 10_000)).toEqual({ kind: "ok" });
  });
});
