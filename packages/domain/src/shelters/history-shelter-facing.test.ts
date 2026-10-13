import { describe, expect, it } from "vitest";
import { ModeratorIdSchema, ShelterAdminIdSchema } from "../primitives/ids";
import type { ShelterHistoryEntry, ShelterHistoryKind } from "./history";
import { ShelterHistoryEntrySchema } from "./history";
import { ShelterFacingHistoryItemSchema, shelterFacingHistoryOf } from "./history-shelter-facing";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const ADMIN_ID = ShelterAdminIdSchema.parse("33333333-3333-4333-8333-333333333333");
const ADMIN = { kind: "shelter_admin", shelterAdminId: ADMIN_ID } as const;
const AT = new Date("2026-10-13T00:00:00.000Z");
const LINK = { url: "https://send.monobank.ua/jar/x", provider: "monobank_jar" } as const;
const CONTACT = { primary: { kind: "phone", e164: "+380501234567" }, additional: [] } as const;
const OPERATOR = "Олексій";

/** One entry per kind; the resubmission carries evidence, which must not survive projection. */
const ENTRIES: Record<ShelterHistoryKind, ShelterHistoryEntry> = {
  verification: {
    kind: "verification",
    event: {
      type: "resubmit",
      at: AT,
      actor: ADMIN,
      evidence: {
        items: [
          {
            kind: "site_visit",
            visitedAt: AT,
            visitedBy: MOD,
            note: "Візит: усе гаразд",
            recordedAt: AT,
            recordedBy: MOD,
          } as never,
        ],
        submittedAt: AT,
      },
    },
    from: "rejected",
    to: "pending",
  },
  contact_changed: {
    kind: "contact_changed",
    at: AT,
    actor: ADMIN,
    previous: CONTACT,
    next: CONTACT,
  },
  freshness_sentence_changed: {
    kind: "freshness_sentence_changed",
    at: AT,
    actor: { kind: "moderator", moderatorId: MOD },
    previous: null,
    next: { uk: "Щосуботи", en: null },
  },
  description_changed: {
    kind: "description_changed",
    at: AT,
    actor: ADMIN,
    previous: { uk: "Було", en: null },
    next: { uk: "Стало", en: null },
  },
  donation_proposed: { kind: "donation_proposed", at: AT, actor: ADMIN, link: LINK },
  donation_proposal_cancelled: { kind: "donation_proposal_cancelled", at: AT, actor: ADMIN },
  donation_decided: {
    kind: "donation_decided",
    at: AT,
    moderatorId: MOD,
    decision: "approved",
    link: LINK,
    previousLive: null,
  },
  verified_data_changed: {
    kind: "verified_data_changed",
    at: AT,
    moderatorId: MOD,
    change: {
      field: "legal_entity",
      previous: { kind: "unregistered_initiative", contactPersonName: "Олена" },
      next: { kind: "unregistered_initiative", contactPersonName: "Олена К." },
    },
  },
  shelter_created: { kind: "shelter_created", at: AT, moderatorId: MOD, via: "script" },
  admin_invited: { kind: "admin_invited", at: AT, moderatorId: MOD, email: "olena@example.org" },
  admin_invitation_resent: {
    kind: "admin_invitation_resent",
    at: AT,
    moderatorId: MOD,
    email: "olena@example.org",
  },
  admin_removed: {
    kind: "admin_removed",
    at: AT,
    moderatorId: MOD,
    email: "olena@example.org",
    wasPending: true,
  },
  animals_imported: { kind: "animals_imported", at: AT, moderatorId: MOD, count: 4 },
};

describe("shelterFacingHistoryOf", () => {
  it("covers every kind the history union defines", () => {
    expect(Object.keys(ENTRIES).length).toBe(ShelterHistoryEntrySchema.options.length);
  });

  for (const [kind, entry] of Object.entries(ENTRIES)) {
    it(`${kind}: parses as a shelter-facing item and carries no moderator id or evidence`, () => {
      const item = shelterFacingHistoryOf(entry, OPERATOR);
      expect(ShelterFacingHistoryItemSchema.parse(item)).toEqual(item);
      const json = JSON.stringify(item);
      expect(json).not.toContain(MOD);
      expect(json).not.toContain(ADMIN_ID);
      expect(json).not.toContain("evidence");
      expect(json).not.toContain("Візит");
      expect(item.kind).toBe(kind);
    });
  }

  it("shows the operator by the display name it was given, never by id", () => {
    expect(shelterFacingHistoryOf(ENTRIES.admin_invited, OPERATOR).actor).toEqual({
      kind: "operator",
      displayName: OPERATOR,
    });
    expect(shelterFacingHistoryOf(ENTRIES.freshness_sentence_changed, OPERATOR).actor).toEqual({
      kind: "operator",
      displayName: OPERATOR,
    });
  });

  it("shows the shelter's own admin as the shelter", () => {
    expect(shelterFacingHistoryOf(ENTRIES.contact_changed, OPERATOR).actor).toEqual({
      kind: "shelter",
    });
    expect(shelterFacingHistoryOf(ENTRIES.verification, OPERATOR).actor).toEqual({
      kind: "shelter",
    });
  });

  it("keeps a rejection's reason, which the shelter already sees verbatim", () => {
    const rejected = shelterFacingHistoryOf(
      {
        kind: "verification",
        event: {
          type: "reject",
          at: AT,
          moderatorId: MOD,
          reason: { code: "insufficient_evidence", note: "Я не зміг перевірити адресу." },
        },
        from: "under_review",
        to: "rejected",
      },
      OPERATOR,
    );
    expect(rejected).toMatchObject({
      event: "reject",
      reason: { code: "insufficient_evidence", note: "Я не зміг перевірити адресу." },
      actor: { kind: "operator", displayName: OPERATOR },
    });
  });
});

describe("who the shelter sees as the actor of a verification move", () => {
  const MOD_ACTOR = { kind: "moderator", moderatorId: MOD } as const;
  const move = (event: unknown, from = "verified", to = "paused") =>
    shelterFacingHistoryOf(
      { kind: "verification", event, from, to } as ShelterHistoryEntry,
      OPERATOR,
    ).actor;
  const reason = { code: "relocation", note: null } as const;
  const operator = { kind: "operator", displayName: OPERATOR };

  it("a pause by the shelter's admin is the shelter; by the operator, the operator", () => {
    expect(move({ type: "pause", at: AT, actor: ADMIN, reason })).toEqual({ kind: "shelter" });
    expect(move({ type: "pause", at: AT, actor: MOD_ACTOR, reason })).toEqual(operator);
  });

  it("a resume by the shelter's admin is the shelter; by the operator, the operator", () => {
    expect(move({ type: "resume", at: AT, actor: ADMIN }, "paused", "verified")).toEqual({
      kind: "shelter",
    });
    expect(move({ type: "resume", at: AT, actor: MOD_ACTOR }, "paused", "verified")).toEqual(
      operator,
    );
  });

  it("a resubmission by the operator is the operator", () => {
    expect(
      move(
        { type: "resubmit", at: AT, actor: MOD_ACTOR, evidence: { items: [], submittedAt: AT } },
        "rejected",
        "pending",
      ),
    ).toEqual(operator);
  });

  it("every moderator-only move is the operator", () => {
    expect(
      move({ type: "start_review", at: AT, reviewerId: MOD }, "pending", "under_review"),
    ).toEqual(operator);
    expect(move({ type: "approve", at: AT, moderatorId: MOD }, "under_review", "verified")).toEqual(
      operator,
    );
  });
});
