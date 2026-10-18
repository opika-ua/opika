import { describe, expect, it } from "vitest";
import {
  AnimalIdSchema,
  InvitationIdSchema,
  ModeratorIdSchema,
  ShelterAdminIdSchema,
} from "../primitives/ids";
import type { ShelterHistoryEntry, ShelterHistoryKind } from "./history";
import { ShelterHistoryEntrySchema } from "./history";
import { ShelterFacingHistoryItemSchema, shelterFacingHistoryOf } from "./history-shelter-facing";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const ADMIN_ID = ShelterAdminIdSchema.parse("33333333-3333-4333-8333-333333333333");
const ADMIN = { kind: "shelter_admin", shelterAdminId: ADMIN_ID } as const;
const INVITATION_ID = InvitationIdSchema.parse("44444444-4444-4444-8444-444444444444");
const ANIMAL_ID = AnimalIdSchema.parse("55555555-5555-4555-8555-555555555555");
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
  admin_joined: {
    kind: "admin_joined",
    at: AT,
    shelterAdminId: ADMIN_ID,
    invitationId: INVITATION_ID,
    email: "olena@example.org",
  },
  animals_imported: { kind: "animals_imported", at: AT, moderatorId: MOD, count: 4 },
  animal_created: {
    kind: "animal_created",
    at: new Date("2026-10-14T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL_ID,
    animalName: "Барсик",
  },
  animal_edited: {
    kind: "animal_edited",
    at: new Date("2026-10-15T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL_ID,
    animalName: "Барсик",
    fields: ["name", "age"],
  },
  animal_listing_changed: {
    kind: "animal_listing_changed",
    at: new Date("2026-10-16T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL_ID,
    animalName: "Барсик",
    event: { type: "withdraw", reason: { code: "other" } },
    from: "reserved",
    to: "withdrawn",
  },
  animal_deleted: {
    kind: "animal_deleted",
    at: new Date("2026-10-17T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL_ID,
    animalName: "Барсик",
  },
  display_name_changed: {
    kind: "display_name_changed",
    at: AT,
    moderatorId: MOD,
    from: "Лапа",
    to: "Лапа допомоги",
  },
};

/** Every key name at any depth of a value, so a nested id can't hide from the check. */
const keysAtAnyDepth = (value: unknown): string[] =>
  value === null || typeof value !== "object"
    ? []
    : Object.entries(value).flatMap(([key, child]) => [key, ...keysAtAnyDepth(child)]);

describe("shelterFacingHistoryOf", () => {
  it("covers every kind the history union defines", () => {
    expect(Object.keys(ENTRIES).length).toBe(ShelterHistoryEntrySchema.options.length);
  });

  for (const [kind, entry] of Object.entries(ENTRIES)) {
    it(`${kind}: parses as a shelter-facing item and carries no id or evidence`, () => {
      const item = shelterFacingHistoryOf(entry, OPERATOR);
      expect(ShelterFacingHistoryItemSchema.parse(item)).toEqual(item);
      const json = JSON.stringify(item);
      expect(json).not.toContain(MOD);
      expect(json).not.toContain(ADMIN_ID);
      expect(json).not.toContain(INVITATION_ID);
      expect(json).not.toContain(ANIMAL_ID);
      expect(
        keysAtAnyDepth(item).filter((key) =>
          ["moderatorId", "shelterAdminId", "invitationId", "animalId"].includes(key),
        ),
      ).toEqual([]);
      expect(json).not.toContain("evidence");
      expect(json).not.toContain("Візит");
      expect(item.kind).toBe(kind);
    });
  }

  /**
   * IN-Q14: the shelter is shown the email stored at join time and nothing
   * else, with its own admin as the actor. The ids stay operator-only.
   */
  it("admin_joined: the stored email, the shelter as actor, and no id", () => {
    expect(shelterFacingHistoryOf(ENTRIES.admin_joined, OPERATOR)).toEqual({
      kind: "admin_joined",
      at: AT,
      actor: { kind: "shelter" },
      email: "olena@example.org",
    });
  });

  /** K-Q7: the animal by name, its own instant, and a withdrawal's reason code (never its note, K-Q18). */
  it("animal_listing_changed: name, instant, move and reason, flattened", () => {
    expect(shelterFacingHistoryOf(ENTRIES.animal_listing_changed, OPERATOR)).toEqual({
      kind: "animal_listing_changed",
      at: new Date("2026-10-16T00:00:00.000Z"),
      actor: { kind: "shelter" },
      animalName: "Барсик",
      event: "withdraw",
      reason: { code: "other" },
      from: "reserved",
      to: "withdrawn",
    });
    expect(
      shelterFacingHistoryOf(
        {
          ...ENTRIES.animal_listing_changed,
          event: { type: "publish" },
          from: "draft",
          to: "published",
        } as ShelterHistoryEntry,
        OPERATOR,
      ),
    ).toMatchObject({ event: "publish", reason: null });
  });

  it("animal_listing_changed: a note on an unparsed entry still never reaches the view (K-Q18)", () => {
    // A row written before K-Q18, or built in memory: the type no longer allows a note.
    const unparsed = {
      ...ENTRIES.animal_listing_changed,
      event: { type: "withdraw", reason: { code: "other", note: "Забрала пані Олена" } },
    } as unknown as ShelterHistoryEntry;
    const view = shelterFacingHistoryOf(unparsed, OPERATOR);
    expect(view).toMatchObject({ reason: { code: "other" } });
    expect(JSON.stringify(view)).not.toContain("Олена");
  });

  it("animal_edited and animal_created/deleted keep their own instant and the field names", () => {
    expect(shelterFacingHistoryOf(ENTRIES.animal_edited, OPERATOR)).toEqual({
      kind: "animal_edited",
      at: new Date("2026-10-15T00:00:00.000Z"),
      actor: { kind: "shelter" },
      animalName: "Барсик",
      fields: ["name", "age"],
    });
    expect(shelterFacingHistoryOf(ENTRIES.animal_created, OPERATOR).at).toEqual(
      new Date("2026-10-14T00:00:00.000Z"),
    );
    expect(shelterFacingHistoryOf(ENTRIES.animal_deleted, OPERATOR)).toEqual({
      kind: "animal_deleted",
      at: new Date("2026-10-17T00:00:00.000Z"),
      actor: { kind: "shelter" },
      animalName: "Барсик",
    });
  });

  /** R-UI 4: both names, the operator as the actor, and no moderator id. */
  it("display_name_changed: both names, the operator by display name", () => {
    expect(shelterFacingHistoryOf(ENTRIES.display_name_changed, OPERATOR)).toEqual({
      kind: "display_name_changed",
      at: AT,
      actor: { kind: "operator", displayName: OPERATOR },
      from: "Лапа",
      to: "Лапа допомоги",
    });
  });

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
