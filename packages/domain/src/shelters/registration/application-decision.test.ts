import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids";
import type { VerificationEvidence } from "../verification/evidence";
import type { ShelterVerification } from "../verification/state";
import {
  ApplicationRejectionReasonSchema,
  acceptApplication,
  rejectApplication,
} from "./application-decision";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const APPLIED = new Date("2026-11-20T00:00:00.000Z");
const NOW = new Date("2026-11-21T00:00:00.000Z");
const EVIDENCE: VerificationEvidence = {
  items: [{ kind: "public_link", url: "https://www.instagram.com/lapa_help/" }],
  submittedAt: APPLIED,
};
const APPLICATION: ShelterVerification = {
  status: "application",
  appliedAt: APPLIED,
  evidence: EVIDENCE,
};
const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: APPLIED,
  evidence: EVIDENCE,
};

describe("acceptApplication («Схвалити»)", () => {
  it("moves to pending and starts the first early-listing period at the same instant", () => {
    const plan = acceptApplication({
      verification: APPLICATION,
      email: "confirmed",
      moderatorId: MOD,
      now: NOW,
    });
    expect(plan).toEqual({
      kind: "ok",
      event: { type: "accept_application", at: NOW, moderatorId: MOD },
      next: { status: "pending", submittedAt: NOW, evidence: EVIDENCE },
      earlyListingSince: NOW,
    });
  });

  it("is refused until the email is confirmed (D1)", () => {
    expect(
      acceptApplication({
        verification: APPLICATION,
        email: "unconfirmed",
        moderatorId: MOD,
        now: NOW,
      }),
    ).toEqual({ kind: "email_unconfirmed" });
  });

  it("answers already_decided on a second click", () => {
    expect(
      acceptApplication({ verification: PENDING, email: "confirmed", moderatorId: MOD, now: NOW }),
    ).toEqual({ kind: "already_decided", status: "pending" });
  });

  it("refuses a decision dated before the application", () => {
    expect(
      acceptApplication({
        verification: APPLICATION,
        email: "confirmed",
        moderatorId: MOD,
        now: new Date(APPLIED.getTime() - 1),
      }),
    ).toEqual({ kind: "non_monotonic" });
  });
});

describe("rejectApplication («Відхилити»)", () => {
  const reason = { code: "not_animal_welfare", note: null } as const;

  it("rejects at the application stage, without starting any listing", () => {
    const plan = rejectApplication({
      verification: APPLICATION,
      reason,
      moderatorId: MOD,
      now: NOW,
    });
    expect(plan).toMatchObject({
      kind: "ok",
      next: { status: "rejected", stage: "application", rejectedAt: NOW, reason },
      earlyListingSince: null,
    });
  });

  it("does not need a confirmed email", () => {
    expect(
      rejectApplication({ verification: APPLICATION, reason, moderatorId: MOD, now: NOW }).kind,
    ).toBe("ok");
  });

  it("answers already_decided on a second click", () => {
    expect(
      rejectApplication({ verification: PENDING, reason, moderatorId: MOD, now: NOW }),
    ).toEqual({ kind: "already_decided", status: "pending" });
  });
});

describe("ApplicationRejectionReasonSchema (A5)", () => {
  it("needs the text for «Інше»", () => {
    expect(ApplicationRejectionReasonSchema.safeParse({ code: "other", note: null }).success).toBe(
      false,
    );
    expect(
      ApplicationRejectionReasonSchema.safeParse({ code: "other", note: "  Це магазин  " }).data,
    ).toEqual({ code: "other", note: "Це магазин" });
  });

  it("offers only the four presets", () => {
    expect(ApplicationRejectionReasonSchema.safeParse({ code: "spam", note: null }).success).toBe(
      false,
    );
  });
});
