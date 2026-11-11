import { randomUUID } from "node:crypto";
import type { Shelter, ShelterVerification } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { notificationRecipientsRepo } from "../src/repos/notification-recipients-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authMember, authUser, superAdmins } from "../src/schema/auth";
import { shelterHistory } from "../src/schema/shelter-history";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

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
