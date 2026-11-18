import { randomUUID } from "node:crypto";
import {
  type AnimalId,
  type ModeratorId,
  type ShelterHistoryEntry,
  type ShelterId,
  type ShelterVerification,
  transition,
} from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { applicationsRepo } from "../src/repos/applications-repo";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { animals } from "../src/schema/animals";
import { authInvitation, authMember, authOrganization, authUser } from "../src/schema/auth";
import { shelters } from "../src/schema/shelters";
import {
  makeAnimal,
  makeCity,
  makeDraftAnimal,
  makeShelter as makeShelterAnywhere,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/** The operator queue's reads and its one conditional decision statement (Agent 2). */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

let cityId: string;
beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

const NOW = new Date("2026-11-20T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const MOD = "11111111-1111-4111-8111-111111111111" as ModeratorId;
const LINK = "https://www.instagram.com/lapa_help/";

const makeShelter = (overrides: Parameters<typeof makeShelterAnywhere>[0] = {}) =>
  makeShelterAnywhere({
    publicLocation: { ...makeShelterAnywhere().publicLocation, cityId } as never,
    ...overrides,
  });

async function user(email: string, emailVerified: boolean): Promise<string> {
  const id = randomUUID();
  await db
    .insert(authUser)
    .values({ id, name: "Олена", email, emailVerified, createdAt: NOW, updatedAt: NOW });
  return id;
}

async function application(input: {
  appliedAt?: Date;
  registrant?: string | null;
  name?: string;
}): Promise<ShelterId> {
  const appliedAt = input.appliedAt ?? NOW;
  const shelter = makeShelter({
    displayName: input.name ?? "Лапа допомоги",
    verification: {
      status: "application",
      appliedAt,
      evidence: { items: [{ kind: "public_link", url: LINK }], submittedAt: appliedAt },
    },
  });
  await shelterRepo(db).insert(shelter);
  if (input.registrant) {
    await db
      .update(shelters)
      .set({ registrantUserId: input.registrant })
      .where(eq(shelters.id, shelter.id));
  }
  return shelter.id;
}

async function plannedAccept(shelterId: ShelterId) {
  const shelter = await shelterRepo(db).findById(shelterId);
  if (shelter === null) throw new Error("no shelter");
  const result = transition(shelter.verification, {
    type: "accept_application",
    at: NOW,
    moderatorId: MOD,
  });
  if (result.kind !== "ok") throw new Error(result.kind);
  const entries: { id: string; entry: ShelterHistoryEntry }[] = [
    {
      id: randomUUID(),
      entry: {
        kind: "verification",
        event: { type: "accept_application", at: NOW, moderatorId: MOD },
        from: "application",
        to: result.next.status,
      },
    },
    {
      id: randomUUID(),
      entry: { kind: "early_listing_allowed", at: NOW, moderatorId: MOD, period: 1, note: null },
    },
  ];
  return {
    shelterId,
    expectedVersion: shelter.version,
    decision: {
      kind: "accept" as const,
      verification: result.next,
      earlyListingSince: NOW,
    },
    entries,
    now: NOW,
  };
}

async function plannedReject(shelterId: ShelterId) {
  const shelter = await shelterRepo(db).findById(shelterId);
  if (shelter === null) throw new Error("no shelter");
  const event = {
    type: "reject" as const,
    at: NOW,
    moderatorId: MOD,
    reason: { code: "not_animal_welfare" as const, note: null },
  };
  const result = transition(shelter.verification, event);
  if (result.kind !== "ok") throw new Error(result.kind);
  return {
    shelterId,
    expectedVersion: shelter.version,
    decision: { kind: "reject" as const, verification: result.next, rejectedAt: NOW },
    entries: [
      {
        id: randomUUID(),
        entry: {
          kind: "verification" as const,
          event,
          from: "application" as const,
          to: result.next.status,
        },
      },
    ],
    now: NOW,
  };
}

const rowOf = async (id: ShelterId) => {
  const [row] = await db.select().from(shelters).where(eq(shelters.id, id));
  if (row === undefined) throw new Error("no row");
  return row;
};

describe("applicationsRepo.pending", () => {
  it("lists applications only, oldest first, with the registrant's address and status", async () => {
    const newer = await application({
      appliedAt: NOW,
      registrant: await user("new@example.org", false),
    });
    const older = await application({
      appliedAt: new Date(NOW.getTime() - 48 * HOUR),
      registrant: await user("old@example.org", true),
    });
    await shelterRepo(db).insert(makeShelter());
    const rows = await applicationsRepo(db).pending();
    expect(rows.map((row) => row.shelterId)).toEqual([older, newer]);
    expect(rows[0]?.registrant).toEqual({ email: "old@example.org", emailVerified: true });
    expect(rows[1]?.registrant).toEqual({ email: "new@example.org", emailVerified: false });
  });

  it("reads an erased registrant as none", async () => {
    await application({ registrant: null });
    expect((await applicationsRepo(db).pending())[0]?.registrant).toBeNull();
  });

  it("counts drafts and their photos, not another shelter's animals", async () => {
    const id = await application({});
    const other = await application({ name: "Інший" });
    const withPhotos = makeDraftAnimal({ shelterId: id });
    for (const draft of [withPhotos, makeDraftAnimal({ shelterId: id })]) {
      await animalRepo(db).insert(draft, cityId as never);
    }
    await animalRepo(db).insert(makeDraftAnimal({ shelterId: other }), cityId as never);
    await db
      .update(animals)
      .set({ photos: sql`'[{}, {}, {}]'::jsonb` })
      .where(eq(animals.id, withPhotos.id));
    const rows = await applicationsRepo(db).pending();
    expect(rows.find((row) => row.shelterId === id)?.drafts).toEqual({ animals: 2, photos: 3 });
    expect(rows.find((row) => row.shelterId === other)?.drafts).toEqual({
      animals: 1,
      photos: 0,
    });
  });
});

describe("applicationsRepo.decide", () => {
  it("accept: pending, the early listing from now, one version bump, both history lines", async () => {
    const id = await application({});
    expect(await applicationsRepo(db).decide(await plannedAccept(id))).toBe("ok");
    const row = await rowOf(id);
    expect(row.verificationStatus).toBe("pending");
    expect(row.earlyListingSince).toEqual(NOW);
    expect(row.applicationRejectedAt).toBeNull();
    expect(row.version).toBe(1);
    expect((await kabinetShelterRepo(db).historyOf(id)).map((entry) => entry.kind).sort()).toEqual([
      "early_listing_allowed",
      "verification",
    ]);
  });

  it("reject: rejected at the application stage, with the clean-up clock started", async () => {
    const id = await application({});
    expect(await applicationsRepo(db).decide(await plannedReject(id))).toBe("ok");
    const row = await rowOf(id);
    expect(row.verificationStatus).toBe("rejected");
    expect((row.verification as Extract<ShelterVerification, { status: "rejected" }>).stage).toBe(
      "application",
    );
    expect(row.applicationRejectedAt).toEqual(NOW);
    expect(row.earlyListingSince).toBeNull();
  });

  it("a stale version writes nothing and records nothing", async () => {
    const id = await application({});
    const planned = await plannedAccept(id);
    await db.update(shelters).set({ version: 5 }).where(eq(shelters.id, id));
    expect(await applicationsRepo(db).decide(planned)).toBe("lost");
    expect((await rowOf(id)).verificationStatus).toBe("application");
    expect(await kabinetShelterRepo(db).historyOf(id)).toEqual([]);
  });

  it("a shelter no longer in application writes nothing, whatever the version", async () => {
    const id = await application({});
    const planned = await plannedReject(id);
    // Moved on with its version unchanged: only the status condition stops the write.
    await db.update(shelters).set({ verificationStatus: "pending" }).where(eq(shelters.id, id));
    expect(await applicationsRepo(db).decide(planned)).toBe("lost");
    expect((await rowOf(id)).applicationRejectedAt).toBeNull();
    expect(await kabinetShelterRepo(db).historyOf(id)).toEqual([]);
  });

  it("a double click: two decisions at once, one lands, one set of history lines", async () => {
    const id = await application({});
    const accept = await plannedAccept(id);
    const reject = await plannedReject(id);
    const results = await Promise.all([
      applicationsRepo(db).decide(accept),
      applicationsRepo(db).decide(reject),
    ]);
    expect([...results].sort()).toEqual(["lost", "ok"]);
    const history = await kabinetShelterRepo(db).historyOf(id);
    expect(history).toHaveLength(results[0] === "ok" ? 2 : 1);
    expect((await rowOf(id)).version).toBe(1);
  });

  it("accept stamps an already-public animal as served; reject touches no animal", async () => {
    const accepted = await application({});
    const rejected = await application({ name: "Другий" });
    const listed = (shelterId: ShelterId) => makeAnimal({ shelterId, everServedAt: null });
    const a = listed(accepted);
    const b = listed(rejected);
    await animalRepo(db).insert(a, cityId as never);
    await animalRepo(db).insert(b, cityId as never);
    await applicationsRepo(db).decide(await plannedAccept(accepted));
    await applicationsRepo(db).decide(await plannedReject(rejected));
    const served = async (id: AnimalId) =>
      (await db.select().from(animals).where(eq(animals.id, id)))[0]?.everServedAt ?? null;
    expect(await served(a.id)).toEqual(NOW);
    expect(await served(b.id)).toBeNull();
  });
});

describe("applicationsRepo.duplicateSources", () => {
  it("names each shelter's member, invitation and registrant addresses", async () => {
    const inviter = await user("inviter@example.org", true);
    const member = await user("member@example.org", true);
    const organizationId = randomUUID();
    await db.insert(authOrganization).values({
      id: organizationId,
      name: "Org",
      slug: `org-${organizationId}`,
      logo: null,
      createdAt: NOW,
      metadata: null,
    });
    await db.insert(authMember).values({
      id: randomUUID(),
      organizationId,
      userId: member,
      role: "admin",
      createdAt: NOW,
    });
    await db.insert(authInvitation).values({
      id: randomUUID(),
      organizationId,
      email: "invited@example.org",
      role: "admin",
      status: "pending",
      expiresAt: NOW,
      createdAt: NOW,
      inviterId: inviter,
    });
    const existing = makeShelter();
    await shelterRepo(db).insert(existing);
    await db.update(shelters).set({ organizationId }).where(eq(shelters.id, existing.id));
    const applied = await application({ registrant: await user("reg@example.org", false) });

    const sources = await applicationsRepo(db).duplicateSources();
    const emailsOf = (id: ShelterId) =>
      [...(sources.find((source) => source.shelterId === id)?.emails ?? [])].sort();
    expect(emailsOf(existing.id)).toEqual(["invited@example.org", "member@example.org"]);
    expect(emailsOf(applied)).toEqual(["reg@example.org"]);
  });
});

describe("applicationsRepo.earlyListed and pendingDonations", () => {
  it("lists accepted applications with a permission, never an operator-created shelter", async () => {
    const id = await application({});
    await applicationsRepo(db).decide(await plannedAccept(id));
    const operatorListed = makeShelter({
      verification: {
        status: "pending",
        submittedAt: NOW,
        evidence: { items: [], submittedAt: NOW },
      },
      earlyListingSince: NOW,
    });
    await shelterRepo(db).insert(operatorListed);
    expect((await applicationsRepo(db).earlyListed()).map((row) => row.shelterId)).toEqual([id]);
  });

  it("lists proposed links oldest first, without a suspended shelter's parked one", async () => {
    const link = { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as const;
    const proposal = (hoursAgo: number) => ({
      link,
      proposedAt: new Date(NOW.getTime() - hoursAgo * HOUR),
      proposedBy: null,
    });
    const newer = makeShelter({ pendingDonation: proposal(1) });
    const older = makeShelter({ pendingDonation: proposal(5) });
    const suspended = makeShelter({
      pendingDonation: proposal(9),
      verification: {
        status: "suspended",
        suspendedAt: NOW,
        suspendedBy: MOD,
        reason: { code: "other", note: "Тест" },
        priorState: { status: "verified", verifiedAt: NOW, verifiedBy: MOD },
        evidence: { items: [], submittedAt: NOW },
      } as never,
    });
    for (const shelter of [newer, older, suspended]) await shelterRepo(db).insert(shelter);
    await shelterRepo(db).insert(makeShelter());
    expect((await applicationsRepo(db).pendingDonations()).map((row) => row.shelterId)).toEqual([
      older.id,
      newer.id,
    ]);
  });
});
