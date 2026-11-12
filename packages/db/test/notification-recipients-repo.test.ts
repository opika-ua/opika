import { randomUUID } from "node:crypto";
import type { Shelter, ShelterVerification } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { notificationRecipientsRepo } from "../src/repos/notification-recipients-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authMember, authUser, superAdmins } from "../src/schema/auth";
import { shelterHistory } from "../src/schema/shelter-history";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/** Real Postgres: which accounts a notification reaches is decided by these joins. */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-11-10T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

async function user(email: string): Promise<string> {
  const id = randomUUID();
  await db.insert(authUser).values({
    id,
    name: "Людина",
    email,
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

async function shelter(overrides: Partial<Shelter> = {}): Promise<Shelter> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const row = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
    ...overrides,
  } as never);
  await shelterRepo(db).insert(row);
  return row;
}

const evidence = { items: [], submittedAt: NOW };
const IN_REVIEW = {
  status: "under_review",
  startedAt: NOW,
  reviewerId: randomUUID(),
  evidence,
} as unknown as ShelterVerification;
const PENDING = { status: "pending", submittedAt: NOW, evidence } as ShelterVerification;

describe("operators", () => {
  it("lists every active grant and no revoked one", async () => {
    const first = await user("op1@example.org");
    const second = await user("op2@example.org");
    const former = await user("former@example.org");
    await user("nobody@example.org");
    for (const [userId, revokedAt] of [
      [first, null],
      [second, null],
      [former, NOW],
    ] as const) {
      await db.insert(superAdmins).values({ id: randomUUID(), userId, grantedAt: NOW, revokedAt });
    }
    const operators = await notificationRecipientsRepo(db).operators();
    expect(operators.map((o) => o.email).sort()).toEqual(["op1@example.org", "op2@example.org"]);
  });

  it("is empty with no operator", async () => {
    expect(await notificationRecipientsRepo(db).operators()).toEqual([]);
  });
});

describe("shelterAdmins", () => {
  it("lists the members of the shelter's organization, not invitees or another shelter's", async () => {
    const mine = await shelter();
    const other = await shelter();
    const invitations = kabinetInvitationRepo(db);
    const organizationId = await invitations.ensureOrganization(
      mine.id,
      { organizationId: randomUUID() },
      NOW,
    );
    const otherOrganizationId = await invitations.ensureOrganization(
      other.id,
      { organizationId: randomUUID() },
      NOW,
    );
    const member = await user("member@example.org");
    const stranger = await user("stranger@example.org");
    await user("invitee@example.org");
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId: member,
      role: "admin",
      createdAt: NOW,
    });
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId: otherOrganizationId,
      userId: stranger,
      role: "admin",
      createdAt: NOW,
    });
    const admins = await notificationRecipientsRepo(db).shelterAdmins(mine.id);
    expect(admins).toEqual([{ userId: member, email: "member@example.org" }]);
  });

  it("is empty for a shelter with no organization yet", async () => {
    const bare = await shelter();
    expect(await notificationRecipientsRepo(db).shelterAdmins(bare.id)).toEqual([]);
  });
});

describe("userById and historyEntry", () => {
  it("finds an account, and null for one that is gone", async () => {
    const id = await user("a@example.org");
    expect(await notificationRecipientsRepo(db).userById(id)).toEqual({
      userId: id,
      email: "a@example.org",
    });
    await db.delete(authUser).where(eq(authUser.id, id));
    expect(await notificationRecipientsRepo(db).userById(id)).toBeNull();
  });

  it("reads a history line back with its dates as dates", async () => {
    const s = await shelter();
    await db.insert(shelterHistory).values({
      id: "h-1",
      shelterId: s.id,
      kind: "early_listing_allowed",
      at: NOW,
      entry: {
        kind: "early_listing_allowed",
        at: NOW,
        moderatorId: randomUUID() as never,
        period: 1,
        note: null,
      },
    });
    const line = await notificationRecipientsRepo(db).historyEntry("h-1");
    expect(line?.shelterId).toBe(s.id);
    expect(line?.entry.kind === "early_listing_allowed" && line.entry.at).toEqual(NOW);
    expect(await notificationRecipientsRepo(db).historyEntry("missing")).toBeNull();
  });
});

describe("earlyListingRunning", () => {
  it("returns open-status shelters inside their 60 days, soonest to expire first", async () => {
    const later = await shelter({ verification: PENDING, earlyListingSince: ago(10) });
    const sooner = await shelter({ verification: IN_REVIEW, earlyListingSince: ago(50) });
    await shelter({ verification: PENDING, earlyListingSince: ago(61) });
    await shelter({ verification: PENDING, earlyListingSince: null });
    await shelter({ earlyListingSince: ago(5) });
    const running = await notificationRecipientsRepo(db).earlyListingRunning(NOW);
    expect(running.map((s) => s.id)).toEqual([sooner.id, later.id]);
    expect(running[0]?.earlyListingSince).toEqual(ago(50));
  });
});
describe("shelterAdminsOf", () => {
  it("names each shelter's members in one query and leaves out shelters with none", async () => {
    const first = await shelter();
    const second = await shelter();
    const bare = await shelter();
    const invitations = kabinetInvitationRepo(db);
    const firstOrg = await invitations.ensureOrganization(
      first.id,
      { organizationId: randomUUID() },
      NOW,
    );
    const secondOrg = await invitations.ensureOrganization(
      second.id,
      { organizationId: randomUUID() },
      NOW,
    );
    const a = await user("a@example.org");
    const b = await user("b@example.org");
    const c = await user("c@example.org");
    for (const [organizationId, userId] of [
      [firstOrg, a],
      [firstOrg, b],
      [secondOrg, c],
    ] as const) {
      await db
        .insert(authMember)
        .values({ id: randomUUID(), organizationId, userId, role: "admin", createdAt: NOW });
    }
    const rows = await notificationRecipientsRepo(db).shelterAdminsOf([
      first.id,
      second.id,
      bare.id,
    ]);
    expect(rows.map((row) => `${row.shelterId}:${row.email}`).sort()).toEqual(
      [
        `${first.id}:a@example.org`,
        `${first.id}:b@example.org`,
        `${second.id}:c@example.org`,
      ].sort(),
    );
    expect(await notificationRecipientsRepo(db).shelterAdminsOf([])).toEqual([]);
  });
});

describe("freshnessReminderDue", () => {
  const evidence = { items: [], submittedAt: NOW };
  const verified = {
    status: "verified",
    verifiedAt: NOW,
    verifiedBy: randomUUID(),
    evidence,
  } as unknown as ShelterVerification;
  const withStatus = (status: string) =>
    ({ ...verified, status }) as unknown as ShelterVerification;
  const card = async (
    s: Shelter,
    listing:
      | { kind: "published" | "reserved"; confirmedAt: Date }
      | { kind: "draft" | "adopted" | "withdrawn" },
  ) => {
    const state =
      listing.kind === "published"
        ? {
            kind: "published",
            publishedAt: listing.confirmedAt,
            confirmedAt: listing.confirmedAt,
            undoable: null,
          }
        : listing.kind === "reserved"
          ? {
              kind: "reserved",
              since: listing.confirmedAt,
              publishedAt: listing.confirmedAt,
              confirmedAt: listing.confirmedAt,
              undoable: null,
            }
          : listing.kind === "adopted"
            ? { kind: "adopted", adoptedAt: NOW }
            : listing.kind === "withdrawn"
              ? { kind: "withdrawn", withdrawnAt: NOW, reason: { code: "other", note: null } }
              : { kind: "draft" };
    await animalRepo(db).insert(
      makeAnimal({ shelterId: s.id, listing: state } as never),
      s.publicLocation.cityId as never,
    );
  };

  it("counts visible cards unconfirmed for at least 14 days, per shelter, in one query", async () => {
    const one = await shelter({ verification: verified, displayName: "Один" });
    const two = await shelter({ verification: verified, displayName: "Два" });
    await card(one, { kind: "published", confirmedAt: ago(14) });
    await card(one, { kind: "reserved", confirmedAt: ago(40) });
    await card(one, { kind: "published", confirmedAt: new Date(ago(14).getTime() + 1) });
    await card(one, { kind: "draft" });
    await card(one, { kind: "adopted" });
    await card(one, { kind: "withdrawn" });
    await card(two, { kind: "published", confirmedAt: ago(15) });
    const due = await notificationRecipientsRepo(db).freshnessReminderDue(NOW);
    expect(due.map((row) => [row.displayName, row.staleCards]).sort()).toEqual(
      [
        ["Один", 2],
        ["Два", 1],
      ].sort(),
    );
  });

  it("includes verified shelters and shelters in a running early-listing period only", async () => {
    const early = await shelter({
      verification: withStatus("pending"),
      earlyListingSince: ago(10),
    });
    const reviewing = await shelter({
      verification: withStatus("under_review"),
      earlyListingSince: ago(59),
    });
    const noPeriod = await shelter({ verification: withStatus("pending") });
    const expired = await shelter({
      verification: withStatus("pending"),
      earlyListingSince: ago(61),
    });
    const paused = await shelter({ verification: withStatus("paused") });
    const suspended = await shelter({ verification: withStatus("suspended") });
    const rejected = await shelter({ verification: withStatus("rejected") });
    const live = await shelter({ verification: verified });
    for (const s of [early, reviewing, noPeriod, expired, paused, suspended, rejected, live]) {
      await card(s, { kind: "published", confirmedAt: ago(20) });
    }
    const ids = (await notificationRecipientsRepo(db).freshnessReminderDue(NOW)).map(
      (row) => row.shelterId,
    );
    expect(ids.sort()).toEqual([early.id, reviewing.id, live.id].sort());
  });

  it("leaves out a shelter whose reminder is switched off, and narrows to one shelter on request", async () => {
    const off = await shelter({ verification: verified, freshnessReminderOffAt: ago(2) });
    const on = await shelter({ verification: verified });
    const other = await shelter({ verification: verified });
    for (const s of [off, on, other]) await card(s, { kind: "published", confirmedAt: ago(20) });
    const repo = notificationRecipientsRepo(db);
    expect((await repo.freshnessReminderDue(NOW)).map((row) => row.shelterId).sort()).toEqual(
      [on.id, other.id].sort(),
    );
    expect(
      (await repo.freshnessReminderDue(NOW, { onlyShelter: on.id })).map((r) => r.shelterId),
    ).toEqual([on.id]);
    expect(await repo.freshnessReminderDue(NOW, { onlyShelter: off.id })).toEqual([]);
  });

  it("is empty when nothing is stale", async () => {
    const live = await shelter({ verification: verified });
    await card(live, { kind: "published", confirmedAt: ago(1) });
    expect(await notificationRecipientsRepo(db).freshnessReminderDue(NOW)).toEqual([]);
  });
});
