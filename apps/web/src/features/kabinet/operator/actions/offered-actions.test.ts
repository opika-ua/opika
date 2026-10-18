import { registryContract } from "@opika/contracts";
import {
  DEFAULT_VERIFICATION_POLICY,
  type EvidenceItem,
  ModeratorIdSchema,
  type ShelterLegalEntity,
  type ShelterVerification,
  transition,
  VERIFICATION_EVENT_TYPES,
  VERIFICATION_STATUSES,
  type VerificationEvent,
  type VerificationEvidence,
  type VerificationStatus,
} from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  OPERATOR_VERIFICATION_EVENTS,
  type OperatorVerificationEvent,
  offeredActionsOf,
} from "./offered-actions";

/**
 * FSM parity (r-ui-plan §3, R-UI 3's key test): for every status, the moves S4
 * offers are exactly the operator events the domain's `transition()` accepts
 * from it. The offered side is `offeredActionsOf`, written by hand; the
 * accepted side is computed here by asking `transition()` itself, so a drift
 * on either side fails.
 */

const MODERATOR = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const STATE_AT = new Date("2026-10-01T09:00:00.000Z");
/** After every sample state, so a refusal can only be `illegal`, never a clock problem. */
const EVENT_AT = new Date("2026-10-10T09:00:00.000Z");

const NGO: ShelterLegalEntity = {
  kind: "registered_ngo",
  legalName: "ГО «Домівка для хвостатих»",
  edrpou: "43218765" as never,
  registeredAt: new Date("2020-01-01T00:00:00.000Z"),
};

const reference = (name: string): EvidenceItem => ({
  kind: "reference_contact",
  name,
  channel: { kind: "phone", e164: "+380501234567" },
  relationship: "veterinary_clinic",
});

const evidenceOf = (items: readonly EvidenceItem[]): VerificationEvidence => ({
  items,
  submittedAt: STATE_AT,
});

const NONE = evidenceOf([]);

/** Every sample state of a status; `suspended` has one per interrupted state. */
const statesFor = (status: VerificationStatus): ShelterVerification[] => {
  switch (status) {
    case "pending":
      return [{ status, submittedAt: STATE_AT, evidence: NONE }];
    case "under_review":
      return [{ status, startedAt: STATE_AT, reviewerId: MODERATOR, evidence: NONE }];
    case "verified":
      return [{ status, verifiedAt: STATE_AT, verifiedBy: MODERATOR, evidence: NONE }];
    case "rejected":
      return [
        {
          status,
          rejectedAt: STATE_AT,
          rejectedBy: MODERATOR,
          reason: { code: "spam", note: "Ні" },
          evidence: NONE,
        },
      ];
    case "paused":
      return [
        {
          status,
          verifiedAt: new Date("2026-09-01T09:00:00.000Z"),
          verifiedBy: MODERATOR,
          pausedAt: STATE_AT,
          pausedBy: { kind: "moderator", moderatorId: MODERATOR },
          reason: { code: "relocation", note: null },
          evidence: NONE,
        },
      ];
    case "suspended":
      return [
        {
          status,
          suspendedAt: STATE_AT,
          suspendedBy: MODERATOR,
          reason: { code: "other", note: "Скарга" },
          priorState: {
            status: "verified",
            verifiedAt: new Date("2026-09-01T09:00:00.000Z"),
            verifiedBy: MODERATOR,
          },
          evidence: NONE,
        },
        {
          status,
          suspendedAt: STATE_AT,
          suspendedBy: MODERATOR,
          reason: { code: "other", note: "Скарга" },
          priorState: {
            status: "paused",
            verifiedAt: new Date("2026-09-01T09:00:00.000Z"),
            verifiedBy: MODERATOR,
            pausedAt: new Date("2026-09-20T09:00:00.000Z"),
            pausedBy: { kind: "moderator", moderatorId: MODERATOR },
            reason: { code: "seasonal_closure", note: null },
          },
          evidence: NONE,
        },
      ];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled status */
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
};

/** A well-formed instance of each operator event, as the registry handlers build it. */
const eventOf = (type: OperatorVerificationEvent): VerificationEvent => {
  switch (type) {
    case "start_review":
      return { type, at: EVENT_AT, reviewerId: MODERATOR };
    case "approve":
    case "reinstate":
      return { type, at: EVENT_AT, moderatorId: MODERATOR };
    case "reject":
      return { type, at: EVENT_AT, moderatorId: MODERATOR, reason: { code: "spam", note: "Ні" } };
    case "suspend":
      return { type, at: EVENT_AT, moderatorId: MODERATOR, reason: { code: "other", note: "Ні" } };
    case "resubmit":
      return {
        type,
        at: EVENT_AT,
        actor: { kind: "moderator", moderatorId: MODERATOR },
        evidence: evidenceOf([]),
      };
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled event */
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
};

const accepted = (state: ShelterVerification): OperatorVerificationEvent[] =>
  OPERATOR_VERIFICATION_EVENTS.filter((type) => {
    const result = transition(state, eventOf(type));
    // Any other refusal would mean the sample is wrong, not the table.
    if (result.kind === "non_monotonic") throw new Error(`${state.status}: sample out of order`);
    return result.kind === "ok";
  });

const offered = (state: ShelterVerification): OperatorVerificationEvent[] =>
  offeredActionsOf(state, NGO).map((action) => action.event);

describe("offered actions = the operator events transition() accepts (FSM parity)", () => {
  it("covers all six statuses (not vacuous)", () => {
    expect(VERIFICATION_STATUSES).toHaveLength(6);
    expect(VERIFICATION_STATUSES.flatMap(statesFor)).toHaveLength(7);
  });

  for (const status of VERIFICATION_STATUSES) {
    it(`${status}: offered == accepted`, () => {
      for (const state of statesFor(status)) {
        expect(new Set(offered(state))).toEqual(new Set(accepted(state)));
        // Each move offered once: a button twice would be a second request.
        expect(offered(state)).toHaveLength(new Set(offered(state)).size);
      }
    });
  }

  /**
   * The same table, transcribed from KABINET.md's S3 «Actions by state»
   * and decision #5 (pending → rejected stays open), so the parity above
   * can't pass by both sides agreeing on nothing.
   */
  it("matches the lifecycle as written down, status by status", () => {
    const expected: Record<VerificationStatus, OperatorVerificationEvent[]> = {
      pending: ["start_review", "reject"],
      under_review: ["approve", "reject"],
      verified: ["suspend"],
      paused: ["suspend"],
      rejected: ["resubmit"],
      suspended: ["reinstate", "reject"],
    };
    for (const status of VERIFICATION_STATUSES) {
      for (const state of statesFor(status)) {
        expect(offered(state), status).toEqual(expected[status]);
      }
    }
  });

  it("never offers approve from pending: always «Взяти на розгляд» first (answer 4)", () => {
    for (const state of statesFor("pending")) expect(offered(state)).not.toContain("approve");
  });
});

describe("the operator's events are the registry's verification procedures", () => {
  /** camelCase procedure names, by hand: the contract's keys for each event. */
  const PROCEDURE: Record<OperatorVerificationEvent, string> = {
    start_review: "startReview",
    approve: "approve",
    reject: "reject",
    suspend: "suspend",
    reinstate: "reinstate",
    resubmit: "resubmit",
  };

  it("one procedure per operator event, and no procedure without one", () => {
    expect(Object.keys(registryContract.registry.verification).sort()).toEqual(
      OPERATOR_VERIFICATION_EVENTS.map((event) => PROCEDURE[event]).sort(),
    );
  });

  it("the domain events S4 leaves out are exactly the shelter's own pause and resume", () => {
    expect(
      VERIFICATION_EVENT_TYPES.filter(
        (type) => !(OPERATOR_VERIFICATION_EVENTS as readonly string[]).includes(type),
      ),
    ).toEqual(["pause", "resume"]);
  });
});

describe("approve is gated by the domain's evidence policy", () => {
  const underReview = (items: readonly EvidenceItem[]): ShelterVerification => ({
    status: "under_review",
    startedAt: STATE_AT,
    reviewerId: MODERATOR,
    evidence: evidenceOf(items),
  });

  const approveOf = (state: ShelterVerification, legalEntity: ShelterLegalEntity) => {
    const action = offeredActionsOf(state, legalEntity).find((a) => a.event === "approve");
    if (action?.event !== "approve") throw new Error("approve not offered");
    return action.gate;
  };

  it("a registered NGO with only a reference: blocked, naming what is missing and how much", () => {
    expect(approveOf(underReview([reference("Ветклініка")]), NGO)).toEqual({
      kind: "blocked",
      gaps: [
        { kind: "edrpou_registration", minimum: 1, provided: 0 },
        { kind: "bank_account_holder", minimum: 1, provided: 0 },
      ],
    });
  });

  it("an unregistered initiative with a site visit and one reference: one reference short", () => {
    const initiative: ShelterLegalEntity = {
      kind: "unregistered_initiative",
      contactPersonName: "Олена Коваль",
    };
    const visit: EvidenceItem = {
      kind: "site_visit",
      visitedAt: STATE_AT,
      visitedBy: MODERATOR,
      notes: "Чисто",
    };
    expect(approveOf(underReview([visit, reference("Ветклініка")]), initiative)).toEqual({
      kind: "blocked",
      gaps: [{ kind: "reference_contact", minimum: 2, provided: 1 }],
    });
    expect(
      approveOf(underReview([visit, reference("Ветклініка"), reference("Громада")]), initiative),
    ).toEqual({ kind: "open" });
  });

  it("a registered NGO with all three: open", () => {
    const items: EvidenceItem[] = [
      {
        kind: "edrpou_registration",
        edrpou: "43218765" as never,
        registeredName: "ГО «Домівка»",
        documentKey: null,
      },
      { kind: "bank_account_holder", holderName: "ГО «Домівка»", documentKey: null },
      reference("Ветклініка"),
    ];
    expect(approveOf(underReview(items), NGO)).toEqual({ kind: "open" });
  });

  it("uses the policy it is given, so a tuned threshold moves the gate", () => {
    const stricter = {
      requirementsByLegalEntity: {
        ...DEFAULT_VERIFICATION_POLICY.requirementsByLegalEntity,
        registered_ngo: [{ kind: "reference_contact", minimum: 3 }],
      },
    } as const;
    const action = offeredActionsOf(underReview([reference("А")]), NGO, stricter).find(
      (a) => a.event === "approve",
    );
    expect(action).toEqual({
      event: "approve",
      gate: { kind: "blocked", gaps: [{ kind: "reference_contact", minimum: 3, provided: 1 }] },
    });
  });
});

describe("reinstate names the state the suspension interrupted", () => {
  it("carries the prior state whole, verified or paused", () => {
    for (const state of statesFor("suspended")) {
      if (state.status !== "suspended") throw new Error("sample is not suspended");
      expect(offeredActionsOf(state, NGO)[0]).toEqual({ event: "reinstate", to: state.priorState });
    }
  });
});
