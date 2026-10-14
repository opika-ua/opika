import { describe, expect, it } from "vitest";
import { InvitationIdSchema, ModeratorIdSchema, ShelterAdminIdSchema } from "../primitives/ids";
import {
  historyEntryAt,
  type ShelterHistoryEntry,
  ShelterHistoryEntrySchema,
  type ShelterHistoryKind,
} from "./history";

const MOD = ModeratorIdSchema.parse("11111111-1111-4111-8111-111111111111");
const ADMIN = {
  kind: "shelter_admin",
  shelterAdminId: ShelterAdminIdSchema.parse("33333333-3333-4333-8333-333333333333"),
} as const;
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
};

describe("ShelterHistoryEntrySchema", () => {
  it("covers every kind the union defines", () => {
    expect(Object.keys(ENTRIES).length).toBe(ShelterHistoryEntrySchema.options.length);
  });

  for (const [kind, entry] of Object.entries(ENTRIES)) {
    it(`parses a ${kind} entry`, () => {
      expect(ShelterHistoryEntrySchema.parse(entry)).toEqual(entry);
    });
  }

  /** Who can decide a donation is part of the shape: a shelter admin can't approve their own link. */
  it("refuses a donation decision by a shelter admin", () => {
    expect(
      ShelterHistoryEntrySchema.safeParse({ ...ENTRIES.donation_decided, moderatorId: ADMIN })
        .success,
    ).toBe(false);
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
        "2026-10-08",
        "2026-10-09",
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
      ],
    );
  });
});
