import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids.js";
import {
  VERIFICATION_EVENT_TYPES,
  type VerificationEvent,
  VerificationEventSchema,
  type VerificationEventType,
} from "./events.js";
import type { VerificationEvidence } from "./evidence.js";
import {
  type ShelterVerification,
  ShelterVerificationSchema,
  VERIFICATION_STATUSES,
  type VerificationStatus,
} from "./state.js";
import { submitForVerification, transition } from "./transition.js";

const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const REVIEWER = ModeratorIdSchema.parse("22222222-2222-4222-8222-222222222222");

const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-02-01T00:00:00.000Z");

const EVIDENCE: VerificationEvidence = { items: [], submittedAt: T0 };

/** Strictly before T0, so a restored approval is distinguishable from a new one. */
const VERIFIED_AT = new Date("2025-06-01T00:00:00.000Z");

/**
 * Evidence that identifies which state it came from.
 *
 * With one shared empty record, an implementation that carried the wrong
 * state's evidence forward was indistinguishable from a correct one.
 */
const evidenceFor = (status: VerificationStatus): VerificationEvidence => ({
  items: [
    {
      kind: "reference_contact",
      name: `ref-${status}`,
      channel: { kind: "phone", e164: "+380501234567" },
      relationship: "veterinary_clinic",
    },
  ],
  submittedAt: T0,
});

/** One representative state per status, entered at `at`. */
const stateFor = (status: VerificationStatus, at: Date = T0): ShelterVerification => {
  const EVIDENCE = evidenceFor(status);
  const T0 = at;
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
    case "paused":
      return {
        status,
        verifiedAt: VERIFIED_AT,
        verifiedBy: MODERATOR,
        pausedAt: T0,
        pausedBy: MODERATOR,
        reason: { code: "seasonal_closure", note: null },
        evidence: EVIDENCE,
      };
    case "suspended":
      return {
        status,
        suspendedAt: T0,
        suspendedBy: MODERATOR,
        reason: { code: "unresponsive", note: null },
        priorState: { status: "verified", verifiedAt: VERIFIED_AT, verifiedBy: MODERATOR },
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
    case "pause":
      return {
        type,
        at: T1,
        moderatorId: MODERATOR,
        reason: { code: "seasonal_closure", note: null },
      };
    case "resume":
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
  verified: { suspend: "suspended", pause: "paused" },
  rejected: { resubmit: "pending" },
  paused: { resume: "verified", suspend: "suspended" },
  suspended: { reinstate: "verified", reject: "rejected" },
};

describe("verification transition table", () => {
  it("covers every (state, event) pair the schemas define", () => {
    // Derived from the schemas, not hardcoded: `satisfies` permits omitting a
    // variant from these arrays, so adding a state without listing it would
    // otherwise shrink the table silently.
    expect(VERIFICATION_STATUSES.length).toBe(ShelterVerificationSchema.options.length);
    expect(VERIFICATION_EVENT_TYPES.length).toBe(VerificationEventSchema.options.length);
    expect(VERIFICATION_STATUSES.length * VERIFICATION_EVENT_TYPES.length).toBe(48);
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

describe("evidence and actor survive every legal edge", () => {
  const legal: ReadonlyArray<[VerificationStatus, VerificationEventType]> = [
    ["pending", "start_review"],
    ["pending", "reject"],
    ["under_review", "approve"],
    ["under_review", "reject"],
    ["verified", "suspend"],
    ["rejected", "resubmit"],
    ["suspended", "reinstate"],
    ["suspended", "reject"],
    ["verified", "pause"],
    ["paused", "resume"],
    ["paused", "suspend"],
  ];

  for (const [status, eventType] of legal) {
    it(`carries the right evidence through ${status} --${eventType}-->`, () => {
      // Dropping evidence on suspend or reinstate passed the old suite, which
      // only checked two of the six edges.
      const event = eventFor(eventType);
      const result = transition(stateFor(status), event);
      if (result.kind !== "ok") throw new Error(`expected ${status} --${eventType}--> to be legal`);

      const expected = event.type === "resubmit" ? event.evidence : evidenceFor(status);
      expect(result.next.evidence).toEqual(expected);
    });
  }

  it("records the acting moderator on each state that names one", () => {
    const approved = transition(stateFor("under_review"), eventFor("approve"));
    if (approved.kind !== "ok" || approved.next.status !== "verified")
      throw new Error("expected verified");
    expect(approved.next.verifiedBy).toBe(MODERATOR);

    const reinstated = transition(stateFor("suspended"), eventFor("reinstate"));
    if (reinstated.kind !== "ok" || reinstated.next.status !== "verified")
      throw new Error("expected verified");
    expect(reinstated.next.verifiedBy).toBe(MODERATOR);

    const suspended = transition(stateFor("verified"), eventFor("suspend"));
    if (suspended.kind !== "ok" || suspended.next.status !== "suspended")
      throw new Error("expected suspended");
    expect(suspended.next.suspendedBy).toBe(MODERATOR);

    const rejected = transition(stateFor("pending"), eventFor("reject"));
    if (rejected.kind !== "ok" || rejected.next.status !== "rejected")
      throw new Error("expected rejected");
    expect(rejected.next.rejectedBy).toBe(MODERATOR);
  });
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
    expect(result.kind === "ok" && result.next.evidence).toEqual(evidenceFor("pending"));
  });

  it("replaces evidence on resubmission", () => {
    const event = eventFor("resubmit");
    const result = transition(stateFor("rejected"), event);
    expect(result.kind === "ok" && result.next.evidence.submittedAt).toEqual(T1);
  });

  it("records the state a suspension interrupted", () => {
    const result = transition(stateFor("verified"), eventFor("suspend"));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok" || result.next.status !== "suspended") {
      throw new Error("expected a suspended state");
    }
    expect(result.next.priorState).toEqual({
      status: "verified",
      verifiedAt: T0,
      verifiedBy: MODERATOR,
    });
  });

  it("keeps the reviewer on the state while under review", () => {
    const result = transition(stateFor("pending"), eventFor("start_review"));
    if (result.kind !== "ok" || result.next.status !== "under_review") {
      throw new Error("expected an under_review state");
    }
    expect(result.next.reviewerId).toBe(REVIEWER);
  });
});

describe("event ordering, for every status", () => {
  // Previously only `pending` was reachable here: every fixture state sat at T0
  // and every event at T1, so the guard was only ever satisfied, never
  // triggered. `enteredAt` could read the wrong field on four of five statuses
  // and the suite stayed green.
  const legalEventFor: Record<VerificationStatus, VerificationEventType> = {
    pending: "start_review",
    under_review: "approve",
    verified: "suspend",
    rejected: "resubmit",
    paused: "resume",
    suspended: "reinstate",
  };

  for (const status of VERIFICATION_STATUSES) {
    it(`refuses an event predating a ${status} state`, () => {
      const current = stateFor(status, T1);
      const event = { ...eventFor(legalEventFor[status]), at: T0 };

      expect(transition(current, event)).toEqual({
        kind: "non_monotonic",
        from: status,
        stateTimestamp: T1,
        eventTimestamp: T0,
      });
    });
  }
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

describe("pausing is not a punishment", () => {
  it("keeps the original approval when a shelter pauses", () => {
    // A paused shelter is still one somebody verified. Losing that would mean
    // asking it to re-submit evidence just because it closed for the winter.
    const result = transition(stateFor("verified"), eventFor("pause"));
    if (result.kind !== "ok" || result.next.status !== "paused") {
      throw new Error("expected a paused state");
    }
    expect(result.next.verifiedAt).toEqual(T0);
    expect(result.next.pausedAt).toEqual(T1);
    expect(result.next.reason.code).toBe("seasonal_closure");
  });

  it("credits the original verifier on resume, not whoever reopened it", () => {
    const paused = transition(stateFor("verified"), eventFor("pause"));
    if (paused.kind !== "ok") throw new Error("expected a pause");

    const resumed = transition(paused.next, { type: "resume", at: T1, moderatorId: REVIEWER });
    if (resumed.kind !== "ok" || resumed.next.status !== "verified") {
      throw new Error("expected a verified state");
    }
    expect(resumed.next.verifiedAt).toEqual(T0);
    expect(resumed.next.verifiedBy).toBe(MODERATOR);
  });

  it("does not let a pause become a permanent ban directly", () => {
    // Removing an accepted shelter is an escalation; the audit trail should
    // show the suspension that preceded it.
    expect(transition(stateFor("paused"), eventFor("reject")).kind).toBe("illegal");
  });

  it("uses a reason list of its own, not moderation codes", () => {
    const result = transition(stateFor("verified"), eventFor("pause"));
    if (result.kind !== "ok" || result.next.status !== "paused") {
      throw new Error("expected a paused state");
    }
    // @ts-expect-error a suspension code is not a valid pause reason
    result.next.reason.code = "complaint_upheld";
  });
});

describe("reinstatement restores what the suspension interrupted", () => {
  it("returns a paused shelter to paused, with its original reason", () => {
    // The failure this prevents: lifting a suspension silently reopening a
    // shelter that had asked to be closed.
    const paused = transition(stateFor("verified"), eventFor("pause"));
    if (paused.kind !== "ok") throw new Error("expected a pause");

    const suspended = transition(paused.next, { ...eventFor("suspend"), at: T1 });
    if (suspended.kind !== "ok") throw new Error("expected a suspension");

    const reinstated = transition(suspended.next, {
      type: "reinstate",
      at: T1,
      moderatorId: REVIEWER,
    });
    if (reinstated.kind !== "ok" || reinstated.next.status !== "paused") {
      throw new Error("expected the shelter to return to paused");
    }
    expect(reinstated.next.reason.code).toBe("seasonal_closure");
    expect(reinstated.next.pausedBy).toBe(MODERATOR);
    expect(reinstated.next.verifiedAt).toEqual(T0);
  });

  it("returns a verified shelter to verified", () => {
    const result = transition(stateFor("suspended"), eventFor("reinstate"));
    if (result.kind !== "ok" || result.next.status !== "verified") {
      throw new Error("expected a verified state");
    }
    // The approval it had before the suspension, not one dated to the lift.
    expect(result.next.verifiedAt).toEqual(VERIFIED_AT);
  });
});
