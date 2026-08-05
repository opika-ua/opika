import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids.js";
import {
  VERIFICATION_EVENT_TYPES,
  type VerificationEvent,
  type VerificationEventType,
} from "./events.js";
import type { VerificationEvidence } from "./evidence.js";
import {
  type ShelterVerification,
  VERIFICATION_STATUSES,
  type VerificationStatus,
} from "./state.js";
import { submitForVerification, transition } from "./transition.js";

const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const REVIEWER = ModeratorIdSchema.parse("22222222-2222-4222-8222-222222222222");

const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-02-01T00:00:00.000Z");

const EVIDENCE: VerificationEvidence = { items: [], submittedAt: T0 };

/** One representative state per status, all entered at T0. */
const stateFor = (status: VerificationStatus): ShelterVerification => {
  switch (status) {
    case "pending":
      return { status, submittedAt: T0, evidence: EVIDENCE };
    case "under_review":
      return { status, startedAt: T0, reviewerId: REVIEWER, evidence: EVIDENCE };
    case "verified":
      return { status, verifiedAt: T0, verifiedBy: MODERATOR, evidence: EVIDENCE };
    case "rejected":
      return {
        status,
        rejectedAt: T0,
        rejectedBy: MODERATOR,
        reason: { code: "insufficient_evidence", note: null },
        evidence: EVIDENCE,
      };
    case "suspended":
      return {
        status,
        suspendedAt: T0,
        suspendedBy: MODERATOR,
        reason: { code: "unresponsive", note: null },
        priorStatus: "verified",
        evidence: EVIDENCE,
      };
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
};

/** One representative event per type, all occurring at T1 (after T0). */
const eventFor = (type: VerificationEventType): VerificationEvent => {
  switch (type) {
    case "start_review":
      return { type, at: T1, reviewerId: REVIEWER };
    case "approve":
      return { type, at: T1, moderatorId: MODERATOR };
    case "reject":
      return { type, at: T1, moderatorId: MODERATOR, reason: { code: "spam", note: null } };
    case "resubmit":
      return { type, at: T1, evidence: { items: [], submittedAt: T1 } };
    case "suspend":
      return {
        type,
        at: T1,
        moderatorId: MODERATOR,
        reason: { code: "complaint_upheld", note: null },
      };
    case "reinstate":
      return { type, at: T1, moderatorId: MODERATOR };
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
};

/**
 * The whole lifecycle in one place. Every legal edge is named here and every
 * pair absent from this map must be refused — which is what makes the generated
 * suite below exhaustive rather than merely thorough.
 */
const LEGAL: Partial<
  Record<VerificationStatus, Partial<Record<VerificationEventType, VerificationStatus>>>
> = {
  pending: { start_review: "under_review", reject: "rejected" },
  under_review: { approve: "verified", reject: "rejected" },
  verified: { suspend: "suspended" },
  rejected: { resubmit: "pending" },
  suspended: { reinstate: "verified", reject: "rejected" },
};

describe("verification transition table", () => {
  it("covers every (state, event) pair", () => {
    expect(VERIFICATION_STATUSES.length * VERIFICATION_EVENT_TYPES.length).toBe(30);
  });

  for (const status of VERIFICATION_STATUSES) {
    for (const eventType of VERIFICATION_EVENT_TYPES) {
      const expected = LEGAL[status]?.[eventType];

      if (expected === undefined) {
        it(`refuses ${status} --${eventType}-->`, () => {
          const result = transition(stateFor(status), eventFor(eventType));
          expect(result).toEqual({ kind: "illegal", from: status, event: eventType });
        });
        continue;
      }

      it(`allows ${status} --${eventType}--> ${expected}`, () => {
        const result = transition(stateFor(status), eventFor(eventType));
        expect(result.kind).toBe("ok");
        if (result.kind !== "ok") return;
        expect(result.next.status).toBe(expected);
      });
    }
  }
});

describe("the edges that are closed on purpose", () => {
  it("does not allow a verified shelter back into review", () => {
    // It would vanish from the feed with no record it had been verified —
    // the failure priorStatus exists to prevent, through another door.
    const result = transition(stateFor("verified"), eventFor("start_review"));
    expect(result.kind).toBe("illegal");
  });

  it("does not allow a shelter under review to be suspended", () => {
    // Suspension applies to a live shelter; one under review is not in the feed.
    const result = transition(stateFor("under_review"), eventFor("suspend"));
    expect(result.kind).toBe("illegal");
  });

  it("does not allow a verified shelter to be re-approved", () => {
    const result = transition(stateFor("verified"), eventFor("approve"));
    expect(result.kind).toBe("illegal");
  });

  it("does not allow a pending shelter to be approved without review", () => {
    const result = transition(stateFor("pending"), eventFor("approve"));
    expect(result.kind).toBe("illegal");
  });
});

describe("state carried through transitions", () => {
  it("preserves evidence when a submission enters review", () => {
    const result = transition(stateFor("pending"), eventFor("start_review"));
    expect(result.kind === "ok" && result.next.evidence).toEqual(EVIDENCE);
  });

  it("replaces evidence on resubmission", () => {
    const event = eventFor("resubmit");
    const result = transition(stateFor("rejected"), event);
    expect(result.kind === "ok" && result.next.evidence.submittedAt).toEqual(T1);
  });

  it("records that a suspended shelter was previously verified", () => {
    const result = transition(stateFor("verified"), eventFor("suspend"));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok" || result.next.status !== "suspended") {
      throw new Error("expected a suspended state");
    }
    expect(result.next.priorStatus).toBe("verified");
  });

  it("keeps the reviewer on the state while under review", () => {
    const result = transition(stateFor("pending"), eventFor("start_review"));
    if (result.kind !== "ok" || result.next.status !== "under_review") {
      throw new Error("expected an under_review state");
    }
    expect(result.next.reviewerId).toBe(REVIEWER);
  });
});

describe("event ordering", () => {
  it("refuses an event dated before the state it acts on", () => {
    const stale: VerificationEvent = { type: "start_review", at: T0, reviewerId: REVIEWER };
    const current: ShelterVerification = {
      status: "pending",
      submittedAt: T1,
      evidence: EVIDENCE,
    };

    expect(transition(current, stale)).toEqual({
      kind: "non_monotonic",
      from: "pending",
      stateTimestamp: T1,
      eventTimestamp: T0,
    });
  });

  it("accepts an event at the same instant as the state", () => {
    const current: ShelterVerification = {
      status: "pending",
      submittedAt: T0,
      evidence: EVIDENCE,
    };
    const result = transition(current, { type: "start_review", at: T0, reviewerId: REVIEWER });
    expect(result.kind).toBe("ok");
  });

  it("reports illegality before ordering", () => {
    // An event the lifecycle forbids is forbidden whatever its timestamp says.
    const current: ShelterVerification = {
      status: "verified",
      verifiedAt: T1,
      verifiedBy: MODERATOR,
      evidence: EVIDENCE,
    };
    const result = transition(current, { type: "approve", at: T0, moderatorId: MODERATOR });
    expect(result.kind).toBe("illegal");
  });
});

describe("submitForVerification", () => {
  it("starts a shelter in pending with the submitted evidence", () => {
    const state = submitForVerification(EVIDENCE, T0);
    expect(state).toEqual({ status: "pending", submittedAt: T0, evidence: EVIDENCE });
  });

  it("produces a state that can immediately enter review", () => {
    const result = transition(submitForVerification(EVIDENCE, T0), eventFor("start_review"));
    expect(result.kind).toBe("ok");
  });
});
