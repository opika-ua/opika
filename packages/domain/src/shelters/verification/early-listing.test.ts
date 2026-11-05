import { describe, expect, it } from "vitest";
import { ModeratorIdSchema } from "../../primitives/ids";
import {
  allowEarlyListing,
  EARLY_LISTING_DAYS,
  EARLY_LISTING_MAX_PERIODS,
  EARLY_LISTING_STATUSES,
  earlyListingCutoff,
  earlyListingExpiresAt,
  earlyListingOf,
  isPubliclyListed,
  keepsEarlyListing,
  lapsedAtOf,
  type PublicListingBasis,
  publicListingBasisOf,
  publicListingBasisOfColumns,
  publicListingLabelOf,
  revokeEarlyListing,
} from "./early-listing";
import { VERIFICATION_EVENT_TYPES } from "./events";
import type { EvidenceItem } from "./evidence";
import { type ShelterVerification, VERIFICATION_STATUSES } from "./state";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const AT = new Date("2026-08-05T00:00:00.000Z");
const NOW = new Date("2026-11-04T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const VISIT: EvidenceItem = { kind: "site_visit", visitedAt: AT, visitedBy: MOD, notes: "n" };
const REFERENCE = {
  kind: "reference_contact",
  name: "Олена",
  channel: { kind: "phone", e164: "+380671234567" },
  relationship: "other",
} as unknown as EvidenceItem;
const BANK = { kind: "bank_account_holder", holderName: "Х", documentKey: null } as EvidenceItem;

const pausedFacts = {
  verifiedAt: AT,
  verifiedBy: MOD,
  pausedAt: AT,
  pausedBy: { kind: "moderator", moderatorId: MOD },
  reason: { code: "relocation", note: null },
} as const;

const stateOf = (
  status: (typeof VERIFICATION_STATUSES)[number],
  items: EvidenceItem[] = [],
): ShelterVerification => {
  const evidence = { items, submittedAt: AT };
  switch (status) {
    case "pending":
      return { status, submittedAt: AT, evidence };
    case "under_review":
      return { status, startedAt: AT, reviewerId: MOD, evidence };
    case "verified":
      return { status, verifiedAt: AT, verifiedBy: MOD, evidence };
    case "rejected":
      return {
        status,
        rejectedAt: AT,
        rejectedBy: MOD,
        reason: { code: "spam", note: null },
        evidence,
      };
    case "paused":
      return { status, ...pausedFacts, evidence };
    case "suspended":
      return {
        status,
        suspendedAt: AT,
        suspendedBy: MOD,
        reason: { code: "unresponsive", note: null },
        priorState: { status: "paused", ...pausedFacts },
        evidence,
      };
  }
};

const sinceOffsets = {
  future: NOW.getTime() + 1,
  now: NOW.getTime(),
  insideByOneMs: NOW.getTime() - EARLY_LISTING_DAYS * DAY + 1,
  exactlyAtExpiry: NOW.getTime() - EARLY_LISTING_DAYS * DAY,
  pastByOneMs: NOW.getTime() - EARLY_LISTING_DAYS * DAY - 1,
};
const LISTED_OFFSETS = new Set(["future", "now", "insideByOneMs"]);
const isOpen = (status: string): boolean =>
  (EARLY_LISTING_STATUSES as readonly string[]).includes(status);

describe("publicListingBasisOf: every status x permission x offset", () => {
  for (const status of VERIFICATION_STATUSES) {
    for (const [name, ms] of Object.entries(sinceOffsets)) {
      it(`${status} with a permission ${name}`, () => {
        const basis = publicListingBasisOf(stateOf(status), earlyListingOf(new Date(ms)), NOW);
        if (status === "verified") {
          expect(basis).toEqual({ kind: "verified" });
        } else if (isOpen(status)) {
          if (LISTED_OFFSETS.has(name)) {
            expect(basis.kind).toBe("listed_before_verification");
          } else {
            expect(basis).toEqual({ kind: "not_listed", why: "expired" });
          }
        } else {
          // A stored value is ignored outside the open statuses.
          expect(basis).toEqual({ kind: "not_listed", why: "status" });
        }
        expect(publicListingBasisOfColumns(status, new Date(ms), NOW)).toBe(basis.kind);
      });
    }
    it(`${status} without a permission`, () => {
      const basis = publicListingBasisOf(stateOf(status), earlyListingOf(null), NOW);
      if (status === "verified") expect(basis.kind).toBe("verified");
      else if (isOpen(status)) expect(basis).toEqual({ kind: "not_listed", why: "not_allowed" });
      else expect(basis).toEqual({ kind: "not_listed", why: "status" });
      expect(publicListingBasisOfColumns(status, null, NOW)).toBe(basis.kind);
    });
  }

  it("expires after exactly EARLY_LISTING_DAYS as an instant sum", () => {
    const since = new Date("2026-10-01T00:00:00.000Z");
    expect(earlyListingExpiresAt(since).getTime() - since.getTime()).toBe(60 * DAY);
    expect(earlyListingCutoff(NOW).getTime()).toBe(NOW.getTime() - 60 * DAY);
  });

  it("carries the dates only on the listed variant, and the label never has them", () => {
    const since = new Date(NOW.getTime() - DAY);
    const basis = publicListingBasisOf(stateOf("pending"), earlyListingOf(since), NOW);
    expect(basis).toEqual({
      kind: "listed_before_verification",
      since,
      expiresAt: earlyListingExpiresAt(since),
    });
    expect(publicListingLabelOf(basis)).toBe("listed_before_verification");
    expect(publicListingLabelOf({ kind: "verified" })).toBe("verified");
    expect(publicListingLabelOf({ kind: "not_listed", why: "status" })).toBeNull();
    const notListed: PublicListingBasis = { kind: "not_listed", why: "expired" };
    expect(isPubliclyListed(notListed)).toBe(false);
    expect(isPubliclyListed(basis)).toBe(true);
  });
});

describe("keepsEarlyListing", () => {
  it("keeps only for a move inside pending and under_review (start_review, an evidence add)", () => {
    for (const from of VERIFICATION_STATUSES) {
      for (const to of VERIFICATION_STATUSES) {
        expect(keepsEarlyListing(from, to)).toBe(isOpen(from) && isOpen(to));
      }
    }
    expect(keepsEarlyListing("pending", "under_review")).toBe(true);
    expect(keepsEarlyListing("under_review", "verified")).toBe(false);
    expect(keepsEarlyListing("under_review", "rejected")).toBe(false);
    expect(keepsEarlyListing("rejected", "pending")).toBe(false);
  });

  it("allow and revoke are not verification events", () => {
    expect(VERIFICATION_EVENT_TYPES as readonly string[]).not.toContain("allow_early_listing");
    expect(VERIFICATION_EVENT_TYPES as readonly string[]).not.toContain("revoke_early_listing");
  });
});

describe("allowEarlyListing", () => {
  const base = { early: earlyListingOf(null), periodsUsed: 0, note: null, now: NOW };

  it("refuses every status but pending and under_review", () => {
    for (const status of VERIFICATION_STATUSES) {
      const result = allowEarlyListing({ ...base, verification: stateOf(status, [VISIT]) });
      if (isOpen(status)) {
        expect(result).toEqual({ kind: "ok", since: NOW, period: 1 });
      } else {
        expect(result).toEqual({ kind: "wrong_status", from: status });
      }
    }
  });

  it("needs one site visit or one reference, nothing else counts", () => {
    const verdict = (items: EvidenceItem[]) =>
      allowEarlyListing({ ...base, verification: stateOf("pending", items) }).kind;
    expect(verdict([])).toBe("evidence_below_minimum");
    expect(verdict([BANK])).toBe("evidence_below_minimum");
    expect(verdict([VISIT])).toBe("ok");
    expect(verdict([REFERENCE])).toBe("ok");
  });

  it("does not restack a running permission", () => {
    const result = allowEarlyListing({
      ...base,
      verification: stateOf("pending", [VISIT]),
      early: earlyListingOf(new Date(NOW.getTime() - DAY)),
      periodsUsed: 1,
      note: "reason",
    });
    expect(result).toEqual({ kind: "already_running" });
  });

  it("allows a second period only with a written note, and never a third", () => {
    const lapsed = earlyListingOf(new Date(sinceOffsets.exactlyAtExpiry));
    const second = (note: string | null) =>
      allowEarlyListing({
        ...base,
        verification: stateOf("under_review", [VISIT]),
        early: lapsed,
        periodsUsed: 1,
        note,
      });
    expect(second(null)).toEqual({ kind: "note_required" });
    expect(second("   ")).toEqual({ kind: "note_required" });
    expect(second("ще чекаємо")).toEqual({ kind: "ok", since: NOW, period: 2 });
    const third = allowEarlyListing({
      ...base,
      verification: stateOf("under_review", [VISIT]),
      periodsUsed: EARLY_LISTING_MAX_PERIODS,
      note: "reason",
    });
    expect(third).toEqual({ kind: "limit_reached" });
  });

  it("reports a missing evidence minimum before the period limit", () => {
    expect(
      allowEarlyListing({
        ...base,
        verification: stateOf("pending"),
        periodsUsed: EARLY_LISTING_MAX_PERIODS,
      }).kind,
    ).toBe("evidence_below_minimum");
  });
});

describe("revokeEarlyListing and lapsedAtOf", () => {
  it("revokes only a running permission", () => {
    const running = earlyListingOf(new Date(NOW.getTime() - DAY));
    expect(revokeEarlyListing(stateOf("pending"), running, NOW)).toEqual({ kind: "ok" });
    expect(revokeEarlyListing(stateOf("pending"), earlyListingOf(null), NOW).kind).toBe(
      "not_running",
    );
    const lapsed = earlyListingOf(new Date(sinceOffsets.pastByOneMs));
    expect(revokeEarlyListing(stateOf("pending"), lapsed, NOW).kind).toBe("not_running");
    expect(revokeEarlyListing(stateOf("verified"), running, NOW).kind).toBe("not_running");
  });

  it("dates a lapse at the expiry instant, not at the write", () => {
    const since = new Date(sinceOffsets.pastByOneMs);
    expect(lapsedAtOf(earlyListingOf(since), NOW)).toEqual(earlyListingExpiresAt(since));
    expect(lapsedAtOf(earlyListingOf(new Date(sinceOffsets.insideByOneMs)), NOW)).toBeNull();
    expect(lapsedAtOf(earlyListingOf(null), NOW)).toBeNull();
  });
});
