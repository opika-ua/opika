import { describe, expect, it } from "vitest";
import { VERIFICATION_STATUSES } from "../verification/state";
import { type ApplicationCleanupCandidate, cleanupVerdictOf } from "./cleanup";

const NOW = new Date("2026-12-01T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const unconfirmed: ApplicationCleanupCandidate = {
  status: "application",
  source: "self_registration",
  appliedAt: daysAgo(14),
  email: "unconfirmed",
  applicationRejectedAt: null,
};

const refused: ApplicationCleanupCandidate = {
  status: "rejected",
  source: "self_registration",
  appliedAt: daysAgo(40),
  email: "confirmed",
  applicationRejectedAt: daysAgo(30),
};

describe("cleanupVerdictOf: the selection matrix", () => {
  it("deletes an application still unconfirmed 14 days after registering, at the boundary", () => {
    expect(cleanupVerdictOf(unconfirmed, NOW)).toEqual({ kind: "delete", reason: "abandoned" });
  });

  it("keeps it one millisecond before the boundary", () => {
    const fresh = { ...unconfirmed, appliedAt: new Date(daysAgo(14).getTime() + 1) };
    expect(cleanupVerdictOf(fresh, NOW)).toEqual({ kind: "keep" });
  });

  it("never deletes a confirmed application waiting for the operator, however old", () => {
    expect(
      cleanupVerdictOf({ ...unconfirmed, email: "confirmed", appliedAt: daysAgo(400) }, NOW),
    ).toEqual({ kind: "keep" });
  });

  it("deletes a refused application 30 days after the refusal, at the boundary", () => {
    expect(cleanupVerdictOf(refused, NOW)).toEqual({ kind: "delete", reason: "rejected_expired" });
    const fresh = { ...refused, applicationRejectedAt: new Date(daysAgo(30).getTime() + 1) };
    expect(cleanupVerdictOf(fresh, NOW)).toEqual({ kind: "keep" });
  });

  it("never deletes a rejection that refused a verification (no application timestamp)", () => {
    expect(cleanupVerdictOf({ ...refused, applicationRejectedAt: null }, NOW)).toEqual({
      kind: "keep",
    });
  });

  it("never touches an operator-created shelter, in any status", () => {
    for (const status of VERIFICATION_STATUSES) {
      for (const base of [unconfirmed, refused]) {
        expect(cleanupVerdictOf({ ...base, status, source: "operator" }, NOW)).toEqual({
          kind: "keep",
        });
      }
    }
  });

  it("never touches an accepted, verified, paused or suspended self-registered shelter", () => {
    for (const status of ["pending", "under_review", "verified", "paused", "suspended"] as const) {
      for (const base of [unconfirmed, refused]) {
        expect(cleanupVerdictOf({ ...base, status }, NOW)).toEqual({ kind: "keep" });
      }
    }
  });
});
