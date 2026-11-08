import { describe, expect, it } from "vitest";
import {
  AnimalIdSchema,
  InvitationIdSchema,
  ModeratorIdSchema,
  ShelterAdminIdSchema,
} from "../primitives/ids";
import {
  historyEntryAt,
  listingHistoryEventOf,
  type ShelterHistoryEntry,
  ShelterHistoryEntrySchema,
  type ShelterHistoryKind,
} from "./history";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const ADMIN = {
  kind: "shelter_admin",
  shelterAdminId: ShelterAdminIdSchema.parse("33333333-3333-4333-8333-333333333333"),
} as const;
const ANIMAL = AnimalIdSchema.parse("55555555-5555-4555-8555-555555555555");
const LINK = { url: "https://send.monobank.ua/jar/x", provider: "monobank_jar" } as const;
const CONTACT = { primary: { kind: "phone", e164: "+380501234567" }, additional: [] } as const;

/** One entry per kind, each with a distinct instant, so `historyEntryAt` reading the wrong field is visible. */
const ENTRIES: Record<ShelterHistoryKind, ShelterHistoryEntry> = {
  verification: {
    kind: "verification",
    event: { type: "approve", at: new Date("2026-10-01T00:00:00.000Z"), moderatorId: MOD },
    from: "under_review",
    to: "verified",
  },
  contact_changed: {
    kind: "contact_changed",
    at: new Date("2026-10-02T00:00:00.000Z"),
    actor: ADMIN,
    previous: CONTACT,
    next: { primary: { kind: "telegram", handle: "lapa_shelter" }, additional: [] },
  },
  freshness_sentence_changed: {
    kind: "freshness_sentence_changed",
    at: new Date("2026-10-03T00:00:00.000Z"),
    actor: ADMIN,
    previous: null,
    next: { uk: "Оновлюємо щосуботи", en: null },
  },
  description_changed: {
    kind: "description_changed",
    at: new Date("2026-10-04T00:00:00.000Z"),
    actor: { kind: "moderator", moderatorId: MOD },
    previous: { uk: "Було", en: null },
    next: { uk: "Стало", en: null },
  },
  donation_proposed: {
    kind: "donation_proposed",
    at: new Date("2026-10-05T00:00:00.000Z"),
    actor: ADMIN,
    link: LINK,
  },
  donation_proposal_cancelled: {
    kind: "donation_proposal_cancelled",
    at: new Date("2026-10-06T00:00:00.000Z"),
    actor: ADMIN,
  },
  donation_decided: {
    kind: "donation_decided",
    at: new Date("2026-10-07T00:00:00.000Z"),
    moderatorId: MOD,
    decision: "approved",
    link: LINK,
    previousLive: null,
  },
  donation_removed: {
    kind: "donation_removed",
    at: new Date("2026-10-07T01:00:00.000Z"),
    moderatorId: MOD,
    previousLive: LINK,
    clearedPending: true,
    reason: { code: "cannot_confirm", note: "Не відкривається" },
  },
  donation_suspended: {
    kind: "donation_suspended",
    at: new Date("2026-10-07T02:00:00.000Z"),
    moderatorId: MOD,
    previousLive: LINK,
    outcome: "moved_to_pending",
  },
  verified_data_changed: {
    kind: "verified_data_changed",
    at: new Date("2026-10-08T00:00:00.000Z"),
    moderatorId: MOD,
    change: {
      field: "legal_entity",
      previous: { kind: "unregistered_initiative", contactPersonName: "Олена" },
      next: { kind: "unregistered_initiative", contactPersonName: "Олена К." },
    },
  },
  shelter_created: {
    kind: "shelter_created",
    at: new Date("2026-10-09T00:00:00.000Z"),
    moderatorId: MOD,
    via: "registry",
  },
  admin_invited: {
    kind: "admin_invited",
    at: new Date("2026-10-10T00:00:00.000Z"),
    moderatorId: MOD,
    email: "olena@example.org",
  },
  admin_invitation_resent: {
    kind: "admin_invitation_resent",
    at: new Date("2026-10-11T00:00:00.000Z"),
    moderatorId: MOD,
    email: "olena@example.org",
  },
  admin_removed: {
    kind: "admin_removed",
    at: new Date("2026-10-12T00:00:00.000Z"),
    moderatorId: MOD,
    email: "olena@example.org",
    wasPending: false,
  },
  animals_imported: {
    kind: "animals_imported",
    at: new Date("2026-10-13T00:00:00.000Z"),
    moderatorId: MOD,
    count: 3,
  },
  admin_joined: {
    kind: "admin_joined",
    at: new Date("2026-10-14T00:00:00.000Z"),
    shelterAdminId: ADMIN.shelterAdminId,
    invitationId: InvitationIdSchema.parse("44444444-4444-4444-8444-444444444444"),
    email: "olena@example.org",
  },
  animal_created: {
    kind: "animal_created",
    at: new Date("2026-10-15T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL,
    animalName: "Барсик",
  },
  animal_edited: {
    kind: "animal_edited",
    at: new Date("2026-10-16T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL,
    animalName: "Барсик",
    fields: ["name", "description"],
  },
  animal_listing_changed: {
    kind: "animal_listing_changed",
    at: new Date("2026-10-17T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL,
    animalName: "Барсик",
    event: { type: "withdraw", reason: { code: "transferred" } },
    from: "published",
    to: "withdrawn",
  },
  animal_deleted: {
    kind: "animal_deleted",
    at: new Date("2026-10-18T00:00:00.000Z"),
    actor: ADMIN,
    animalId: ANIMAL,
    animalName: "Барсик",
  },
  display_name_changed: {
    kind: "display_name_changed",
    at: new Date("2026-10-19T00:00:00.000Z"),
    moderatorId: MOD,
    from: "Лапа",
    to: "Лапа допомоги",
  },
  logo_changed: {
    kind: "logo_changed",
    at: new Date("2026-10-20T00:00:00.000Z"),
    actor: ADMIN,
    previous: null,
    next: { storageKey: "shelters/s/logo/0", width: 160, height: 160 },
  },
  evidence_added: {
    kind: "evidence_added",
    at: new Date("2026-10-21T00:00:00.000Z"),
    moderatorId: MOD,
    items: [{ kind: "reference_contact" }],
    statusAt: "pending",
  },
  early_listing_allowed: {
    kind: "early_listing_allowed",
    at: new Date("2026-10-22T00:00:00.000Z"),
    moderatorId: MOD,
    period: 1,
    note: null,
  },
  early_listing_revoked: {
    kind: "early_listing_revoked",
    at: new Date("2026-10-23T00:00:00.000Z"),
    moderatorId: MOD,
  },
  early_listing_lapsed: { kind: "early_listing_lapsed", at: new Date("2026-12-21T00:00:00.000Z") },
};

describe("ShelterHistoryEntrySchema", () => {
  it("still parses a stored suspension that holds the retired suspected_fraud code", () => {
    const stored = {
      kind: "verification",
      event: {
        type: "suspend",
        at: new Date("2026-10-01T00:00:00.000Z"),
        moderatorId: MOD,
        reason: { code: "suspected_fraud", note: "Давній запис" },
      },
      from: "verified",
      to: "suspended",
    };
    expect(ShelterHistoryEntrySchema.parse(stored)).toEqual(stored);
  });

  it("covers every kind the union defines", () => {
    expect(Object.keys(ENTRIES).length).toBe(ShelterHistoryEntrySchema.options.length);
  });

  for (const [kind, entry] of Object.entries(ENTRIES)) {
    it(`parses a ${kind} entry`, () => {
      expect(ShelterHistoryEntrySchema.parse(entry)).toEqual(entry);
    });
  }

  it("refuses a removal without a note or by a shelter admin", () => {
    const removed = ENTRIES.donation_removed;
    expect(
      ShelterHistoryEntrySchema.safeParse({ ...removed, reason: { code: "other", note: "" } })
        .success,
    ).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse({ ...removed, moderatorId: ADMIN }).success).toBe(
      false,
    );
  });

  /** Who can decide a donation is part of the shape: a shelter admin can't approve their own link. */
  it("refuses a donation decision by a shelter admin", () => {
    expect(
      ShelterHistoryEntrySchema.safeParse({ ...ENTRIES.donation_decided, moderatorId: ADMIN })
        .success,
    ).toBe(false);
  });
});

describe("evidence_added", () => {
  const added = ENTRIES.evidence_added;

  it("is operator-authored, names at least one kind, and only pending or under_review", () => {
    expect(ShelterHistoryEntrySchema.safeParse({ ...added, moderatorId: ADMIN }).success).toBe(
      false,
    );
    expect(ShelterHistoryEntrySchema.safeParse({ ...added, items: [] }).success).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse({ ...added, statusAt: "verified" }).success).toBe(
      false,
    );
  });

  it("stores kinds only: a content field on an item is stripped, never kept", () => {
    const parsed = ShelterHistoryEntrySchema.parse({
      ...added,
      items: [{ kind: "reference_contact", name: "Клініка", channel: { kind: "phone" } }],
    });
    expect(JSON.stringify(parsed)).not.toContain("Клініка");
    expect(Object.keys(added).sort()).toEqual(["at", "items", "kind", "moderatorId", "statusAt"]);
  });
});

describe("display_name_changed (R-UI 4)", () => {
  const renamed = ENTRIES.display_name_changed;

  /** Only the operator renames: a line naming a shelter admin is a shape history never holds. */
  it("refuses an actor-shaped author: a rename is recorded with a moderator id only", () => {
    expect(ShelterHistoryEntrySchema.safeParse({ ...renamed, moderatorId: ADMIN }).success).toBe(
      false,
    );
  });

  it("refuses a line missing either name, or with an empty one", () => {
    const { from: _f, ...noFrom } = renamed as Extract<
      ShelterHistoryEntry,
      { kind: "display_name_changed" }
    >;
    const { to: _t, ...noTo } = renamed as Extract<
      ShelterHistoryEntry,
      { kind: "display_name_changed" }
    >;
    expect(ShelterHistoryEntrySchema.safeParse(noFrom).success).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse(noTo).success).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse({ ...renamed, to: "" }).success).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse({ ...renamed, from: "" }).success).toBe(false);
  });
});

describe("admin_joined", () => {
  /** IN-Q14: the email is stored at join time, so an entry without one is refused, not resolved later. */
  it("refuses an entry without the email, or without either id", () => {
    const { email: _e, ...noEmail } = ENTRIES.admin_joined as Extract<
      ShelterHistoryEntry,
      { kind: "admin_joined" }
    >;
    const { invitationId: _i, ...noInvitation } = ENTRIES.admin_joined as Extract<
      ShelterHistoryEntry,
      { kind: "admin_joined" }
    >;
    const { shelterAdminId: _a, ...noAdmin } = ENTRIES.admin_joined as Extract<
      ShelterHistoryEntry,
      { kind: "admin_joined" }
    >;
    expect(ShelterHistoryEntrySchema.safeParse(noEmail).success).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse(noInvitation).success).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse(noAdmin).success).toBe(false);
  });
});

describe("a shelter's own animal writes (K-Q7)", () => {
  /** Field names only, never values: an edit entry carrying a value is refused, not stored. */
  it("refuses an edit entry with no fields, an unknown field, or a value alongside", () => {
    const edited = ENTRIES.animal_edited;
    expect(ShelterHistoryEntrySchema.safeParse({ ...edited, fields: [] }).success).toBe(false);
    expect(ShelterHistoryEntrySchema.safeParse({ ...edited, fields: ["weight"] }).success).toBe(
      false,
    );
    const parsed = ShelterHistoryEntrySchema.parse({ ...edited, next: { name: "Мурчик" } });
    expect(parsed).not.toHaveProperty("next");
  });

  /** S1: «Ще шукає» and its undo are never history, so the entry's event list has no slot for them. */
  it("refuses a confirmation as a listing move", () => {
    for (const type of ["confirm", "undo_confirm"]) {
      expect(
        ShelterHistoryEntrySchema.safeParse({ ...ENTRIES.animal_listing_changed, event: { type } })
          .success,
      ).toBe(false);
    }
  });

  it("refuses a withdrawal without its reason", () => {
    expect(
      ShelterHistoryEntrySchema.safeParse({
        ...ENTRIES.animal_listing_changed,
        event: { type: "withdraw" },
      }).success,
    ).toBe(false);
  });

  /** Review finding 5, K-Q18: a note can name an adopter, and history can't be erased. */
  it("drops a withdrawal's note when reading a stored entry", () => {
    const parsed = ShelterHistoryEntrySchema.parse({
      ...ENTRIES.animal_listing_changed,
      event: { type: "withdraw", reason: { code: "other", note: "Забрала пані Олена" } },
    });
    expect(JSON.stringify(parsed)).not.toContain("Олена");
  });
});

describe("listingHistoryEventOf", () => {
  it("keeps a withdrawal's code and never its note", () => {
    const recorded = listingHistoryEventOf({
      type: "withdraw",
      reason: { code: "other", note: "Забрала пані Олена" },
    });
    expect(recorded).toEqual({ type: "withdraw", reason: { code: "other" } });
    expect(JSON.stringify(recorded)).not.toContain("Олена");
  });

  it("keeps every other move as its type alone", () => {
    for (const type of ["publish", "reserve", "release", "adopt", "restore_to_draft"] as const) {
      expect(listingHistoryEventOf({ type })).toEqual({ type });
    }
  });
});

describe("historyEntryAt", () => {
  it("dates each entry by its own instant, a verification entry by its event's", () => {
    expect(Object.values(ENTRIES).map((e) => historyEntryAt(e).toISOString().slice(0, 10))).toEqual(
      [
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
        "2026-10-04",
        "2026-10-05",
        "2026-10-06",
        "2026-10-07",
        "2026-10-07",
        "2026-10-07",
        "2026-10-08",
        "2026-10-09",
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
        "2026-10-15",
        "2026-10-16",
        "2026-10-17",
        "2026-10-18",
        "2026-10-19",
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        "2026-12-21",
      ],
    );
  });
});
