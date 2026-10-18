import {
  donationProviderOf,
  type ModeratorId,
  type Shelter,
  type ShelterAdminId,
  type ShelterId,
  type ShelterVerification,
} from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { kabinetRegistryRepo, type RegistryListPosition } from "../src/repos/kabinet-registry-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authInvitation, authMember, authUser } from "../src/schema/auth";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-13T10:00:00.000Z");
const MOD = "mod-1" as ModeratorId;
const evidence = { items: [], submittedAt: NOW };
const STATES = {
  pending: { status: "pending", submittedAt: NOW, evidence },
  under_review: { status: "under_review", startedAt: NOW, reviewerId: MOD, evidence },
  verified: { status: "verified", verifiedAt: NOW, verifiedBy: MOD, evidence },
  rejected: {
    status: "rejected",
    rejectedAt: NOW,
    rejectedBy: MOD,
    reason: { code: "spam", note: null },
    evidence,
  },
} as const satisfies Record<string, ShelterVerification>;

let cityId: string;
let n = 0;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

async function shelter(
  displayName: string,
  status: keyof typeof STATES,
  extra: Partial<Shelter> = {},
): Promise<Shelter> {
  const s = makeShelter({
    displayName,
    verification: STATES[status] as ShelterVerification,
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
    ...extra,
  });
  await shelterRepo(db).insert(s);
  return s;
}

const pendingDonation = (url: string) => ({
  link: { url, provider: donationProviderOf(url) },
  proposedAt: NOW,
  proposedBy: "admin-1" as ShelterAdminId,
});

const repo = () => kabinetRegistryRepo(db);
const list = (opts: { search?: string; status?: keyof typeof STATES; limit?: number } = {}) =>
  repo().listPage({
    search: opts.search ?? null,
    status: opts.status ?? null,
    after: null,
    limit: opts.limit ?? 50,
  });

describe("kabinetRegistryRepo.listPage (S1)", () => {
  /** KABINET S1: "things awaiting the operator first, then by name". */
  it("puts everything awaiting the operator first, each group by name", async () => {
    await shelter("Вірні друзі", "verified");
    await shelter("Барбос", "pending");
    await shelter("Ясна", "under_review");
    await shelter("Абрикос", "rejected");
    await shelter("Гав", "verified", {
      pendingDonation: pendingDonation("https://send.monobank.ua/jar/abc"),
    });
    const { items } = await list();
    expect(items.map((row) => [row.displayName, row.rank])).toEqual([
      ["Барбос", 0],
      ["Гав", 0],
      ["Ясна", 0],
      ["Абрикос", 1],
      ["Вірні друзі", 1],
    ]);
  });

  it("pages through the same order with no row repeated or skipped", async () => {
    for (const [name, status] of [
      ["Е", "verified"],
      ["Д", "pending"],
      ["Г", "rejected"],
      ["В", "under_review"],
      ["Б", "verified"],
      ["А", "pending"],
    ] as const) {
      await shelter(name, status);
    }
    const seen: string[] = [];
    let after: RegistryListPosition | null = null;
    for (let page = 0; page < 5; page += 1) {
      const result = await repo().listPage({ search: null, status: null, after, limit: 2 });
      seen.push(...result.items.map((row) => row.displayName));
      after = result.next;
      if (after === null) break;
    }
    expect(seen).toEqual(["А", "В", "Д", "Б", "Г", "Е"]);
  });

  it("breaks a tie on name by id, so equal names page cleanly", async () => {
    const a = await shelter("Однакова", "verified");
    const b = await shelter("Однакова", "verified");
    const first = await repo().listPage({ search: null, status: null, after: null, limit: 1 });
    const second = await repo().listPage({
      search: null,
      status: null,
      after: first.next,
      limit: 1,
    });
    expect([...first.items, ...second.items].map((row) => row.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(second.next).toBeNull();
  });

  it("searches names case-insensitively, with % and _ taken literally", async () => {
    await shelter("Хвостик", "verified");
    await shelter("Друзі хвостиків", "pending");
    await shelter("100% Лапи", "verified");
    await shelter("Лапи", "verified");
    expect((await list({ search: "ХВОСТ" })).items.map((row) => row.displayName)).toEqual([
      "Друзі хвостиків",
      "Хвостик",
    ]);
    expect((await list({ search: "%" })).items.map((row) => row.displayName)).toEqual([
      "100% Лапи",
    ]);
    expect((await list({ search: "_" })).items).toEqual([]);
  });

  it("filters by status", async () => {
    await shelter("А", "verified");
    await shelter("Б", "pending");
    expect((await list({ status: "pending" })).items.map((row) => row.displayName)).toEqual(["Б"]);
  });

  it("counts every animal of the shelter, drafts included, and 0 for none", async () => {
    const withAnimals = await shelter("А", "verified");
    await shelter("Б", "verified");
    const repoA = animalRepo(db);
    await repoA.insert(makeAnimal({ shelterId: withAnimals.id }), cityId as never);
    await repoA.insert(
      makeAnimal({ shelterId: withAnimals.id, listing: { kind: "draft" } as never }),
      cityId as never,
    );
    const { items } = await list();
    expect(items.map((row) => [row.displayName, row.animalCount])).toEqual([
      ["А", 2],
      ["Б", 0],
    ]);
  });
});

describe("kabinetRegistryRepo.statusCounts (S1 chips)", () => {
  it("counts every status, follows the search, and ignores the status filter", async () => {
    await shelter("Хвостик", "verified");
    await shelter("Хвіст", "pending");
    await shelter("Лапи", "pending");
    expect(await repo().statusCounts(null)).toEqual({
      pending: 2,
      under_review: 0,
      verified: 1,
      rejected: 0,
      paused: 0,
      suspended: 0,
    });
    expect(await repo().statusCounts("хв")).toMatchObject({ pending: 1, verified: 1 });
  });
});

const invite = (shelterId: ShelterId, email: string, at = NOW) =>
  kabinetInvitationRepo(db).invite({
    shelterId,
    email,
    name: `Ім'я ${email}`,
    inviterUserId: "op",
    ids: { invitationId: `inv-${++n}`, userId: `user-${n}`, organizationId: `org-${n}` },
    now: at,
    history: {
      id: crypto.randomUUID(),
      entry: { kind: "admin_invited", at: at, moderatorId: "op" as never, email: email },
    },
  });

const insertOperator = () =>
  db.insert(authUser).values({
    id: "op",
    name: "Оператор",
    email: "op@example.org",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });

/** The shelter's organization id, once its first invitation has made one. */
async function organizationOf(shelterId: ShelterId): Promise<string> {
  const id = await repo().organizationIdOf(shelterId);
  if (id === null) throw new Error("no organization yet");
  return id;
}

async function makeMember(shelterId: ShelterId, userId: string): Promise<void> {
  await db.insert(authMember).values({
    id: `m-${++n}`,
    organizationId: await organizationOf(shelterId),
    userId,
    role: "admin",
    createdAt: NOW,
  });
}

const invitedUserId = (result: Awaited<ReturnType<typeof invite>>): string => {
  if (result.kind !== "invited") throw new Error(`not invited: ${result.kind}`);
  return result.userId;
};

/**
 * R-UI answer 2 (Oleksii, verbatim: "Yes: add the admins count (signed in /
 * invited) and the donationPending flag to the list row, in one query (no
 * N+1)."). The counts must agree with S4's list (`adminsOf`), which is what
 * the operator sees on opening the row.
 */
describe("kabinetRegistryRepo.listPage: admins and donationPending (R-UI answer 2)", () => {
  beforeEach(async () => {
    await insertOperator();
  });

  const rowOf = async (shelterId: ShelterId) => {
    const row = (await list()).items.find((item) => item.id === shelterId);
    if (row === undefined) throw new Error("row not listed");
    return row;
  };

  it("is 0 joined and 0 invited for a shelter that has never invited anyone", async () => {
    const s = await shelter("А", "pending");
    expect((await rowOf(s.id)).admins).toEqual({ joined: 0, invited: 0 });
  });

  it("counts members as joined and pending invitations as invited, expired ones included", async () => {
    const s = await shelter("А", "pending");
    await makeMember(s.id, invitedUserId(await invite(s.id, "member@example.org")));
    await invite(s.id, "pending@example.org");
    // Invited ten days ago: the 72-hour link has expired, the invitation is still pending.
    await invite(s.id, "expired@example.org", new Date(NOW.getTime() - 10 * 86_400_000));
    expect((await rowOf(s.id)).admins).toEqual({ joined: 1, invited: 2 });
  });

  it("counts a member whose old invitation is still pending once, as joined", async () => {
    const s = await shelter("А", "pending");
    const userId = invitedUserId(await invite(s.id, "member@example.org"));
    await makeMember(s.id, userId);
    // The invitation row stays `pending`: membership was written beside it.
    expect((await rowOf(s.id)).admins).toEqual({ joined: 1, invited: 0 });
  });

  it("counts a re-invited address once, and a withdrawn invitation not at all", async () => {
    const s = await shelter("А", "pending");
    await invite(s.id, "again@example.org");
    await invite(s.id, "again@example.org", new Date(NOW.getTime() + 1000));
    const gone = await invite(s.id, "gone@example.org");
    if (gone.kind !== "invited") throw new Error("unreachable");
    await kabinetInvitationRepo(db).revoke(gone.invitationId);
    expect((await rowOf(s.id)).admins).toEqual({ joined: 0, invited: 1 });
  });

  it("never counts another shelter's admins", async () => {
    const mine = await shelter("А", "pending");
    const theirs = await shelter("Б", "pending");
    await invite(mine.id, "mine@example.org");
    await makeMember(theirs.id, invitedUserId(await invite(theirs.id, "theirs@example.org")));
    await invite(theirs.id, "theirs-2@example.org");
    expect((await rowOf(mine.id)).admins).toEqual({ joined: 0, invited: 1 });
    expect((await rowOf(theirs.id)).admins).toEqual({ joined: 1, invited: 1 });
  });

  it("agrees with adminsOf, the list S4 shows", async () => {
    const s = await shelter("А", "pending");
    await makeMember(s.id, invitedUserId(await invite(s.id, "a@example.org")));
    await makeMember(s.id, invitedUserId(await invite(s.id, "b@example.org")));
    await invite(s.id, "c@example.org");
    await invite(s.id, "c@example.org", new Date(NOW.getTime() + 1000));
    await invite(s.id, "d@example.org", new Date(NOW.getTime() - 10 * 86_400_000));
    const listed = await repo().adminsOf(s.id);
    expect((await rowOf(s.id)).admins).toEqual({
      joined: listed.filter((admin) => admin.invite.status === "accepted").length,
      invited: listed.filter((admin) => admin.invite.status === "pending").length,
    });
    expect((await rowOf(s.id)).admins).toEqual({ joined: 2, invited: 2 });
  });

  it("flags a proposed donation link, and only that, as donationPending", async () => {
    const waiting = await shelter("А", "verified", {
      pendingDonation: pendingDonation("https://send.monobank.ua/jar/abc"),
    });
    const none = await shelter("Б", "verified");
    const pendingStatus = await shelter("В", "pending");
    expect((await rowOf(waiting.id)).donationPending).toBe(true);
    expect((await rowOf(none.id)).donationPending).toBe(false);
    // Waiting on the operator for its status, not for a link: rank 0, but no link pending.
    expect(await rowOf(pendingStatus.id)).toMatchObject({ rank: 0, donationPending: false });
  });

  it("pages with the counts intact", async () => {
    const a = await shelter("А", "verified");
    const b = await shelter("Б", "verified");
    await invite(a.id, "a@example.org");
    await makeMember(b.id, invitedUserId(await invite(b.id, "b@example.org")));
    const first = await repo().listPage({ search: null, status: null, after: null, limit: 1 });
    const second = await repo().listPage({
      search: null,
      status: null,
      after: first.next,
      limit: 1,
    });
    expect([...first.items, ...second.items].map((row) => [row.displayName, row.admins])).toEqual([
      ["А", { joined: 0, invited: 1 }],
      ["Б", { joined: 1, invited: 0 }],
    ]);
  });
});

describe("kabinetRegistryRepo.adminsOf (S4)", () => {
  beforeEach(async () => {
    await insertOperator();
  });

  it("is empty for a shelter with no organization yet", async () => {
    const s = await shelter("А", "pending");
    expect(await repo().adminsOf(s.id)).toEqual([]);
  });

  it("lists members as accepted and pending invitations once each, latest expiry, never a cancelled one", async () => {
    const s = await shelter("А", "pending");
    const accepted = await invite(s.id, "member@example.org");
    const pending = await invite(s.id, "pending@example.org");
    const reinvited = await invite(s.id, "pending@example.org", new Date(NOW.getTime() + 1000));
    const cancelled = await invite(s.id, "gone@example.org");
    if (
      accepted.kind !== "invited" ||
      pending.kind !== "invited" ||
      reinvited.kind !== "invited" ||
      cancelled.kind !== "invited"
    ) {
      throw new Error("unreachable");
    }
    await kabinetInvitationRepo(db).revoke(cancelled.invitationId);
    const [org] = await db
      .select({ id: authInvitation.organizationId })
      .from(authInvitation)
      .limit(1);
    await db.insert(authMember).values({
      id: "m1",
      organizationId: org?.id ?? "",
      userId: accepted.userId,
      role: "admin",
      createdAt: NOW,
    });
    expect(await repo().adminsOf(s.id)).toEqual([
      {
        userId: accepted.userId,
        name: "Ім'я member@example.org",
        email: "member@example.org",
        invite: { status: "accepted" },
      },
      {
        userId: pending.userId,
        name: "Ім'я pending@example.org",
        email: "pending@example.org",
        invite: { status: "pending", expiresAt: reinvited.expiresAt },
      },
    ]);
  });

  it("never lists another shelter's admins", async () => {
    const mine = await shelter("А", "pending");
    const theirs = await shelter("Б", "pending");
    // Both have an organization, so the list is filtered, not empty by default.
    await invite(mine.id, "mine@example.org");
    await invite(theirs.id, "theirs@example.org");
    expect((await repo().adminsOf(mine.id)).map((admin) => admin.email)).toEqual([
      "mine@example.org",
    ]);
  });
});
