import {
  type CityId,
  DEFAULT_SEEN_SET_POLICY,
  NO_FILTERS,
  publicLocationOf,
  type Shelter,
  type ShelterId,
  testOnlyLocationPolicy,
} from "@opika/domain";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_REMOVAL_TABLES,
  type DemoRemovalCounts,
  expectedTargetOf,
  formatPlan,
  planDemoRemoval,
  removeDemoCorpus,
} from "../src/demo-remove";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { feedRepo } from "../src/repos/feed-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { swipeRepo } from "../src/repos/swipe-repo";
import { animals } from "../src/schema/animals";
import {
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  invitationCreatedUsers,
  superAdmins,
  supportSessions,
} from "../src/schema/auth";
import { cities } from "../src/schema/cities";
import { reveals } from "../src/schema/reveals";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import { swipes } from "../src/schema/swipes";
import { recordAnimalsImported } from "../src/script-history";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
  uuid,
} from "../src/test-utils/index";

/**
 * `demo:remove` (inbox DR-B1, Oleksii's Phase 0 answers, 2026-10-15). Every
 * fixture names which side of the corpus it is on; the assertions check both
 * that the demo side is gone and that the other side is untouched.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-15T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T12:00:00.000Z");
const ACTOR = { moderatorId: "0ec0ec0e-0000-4000-8000-0000000000aa" as never, now: NOW };
/** The seed's key and reserved range, written out rather than imported from the code under test. */
const testKey = testOnlyLocationPolicy("seed");
const seedId = (n: number) => `51000000-0000-4000-8000-00000000000${n}` as ShelterId;

const ZERO: DemoRemovalCounts = Object.fromEntries(
  DEMO_REMOVAL_TABLES.map((t) => [t, 0]),
) as DemoRemovalCounts;

let cityId: CityId;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

const at = (cityIdValue: CityId) => ({ ...makeShelter().publicLocation, cityId: cityIdValue });

async function insertShelter(
  opts: { id?: ShelterId; displayName?: string; onTestKey?: boolean } = {},
): Promise<Shelter> {
  const base = makeShelter({
    ...(opts.id === undefined ? {} : { id: opts.id }),
    ...(opts.displayName === undefined ? {} : { displayName: opts.displayName }),
    publicLocation: at(cityId) as never,
  });
  const shelter = opts.onTestKey
    ? { ...base, publicLocation: publicLocationOf(base.id, base.exactAddress, testKey) }
    : base;
  await shelterRepo(db).insert(shelter);
  return shelter;
}

async function insertAnimal(shelterId: ShelterId, confirmedAt: Date = NOW) {
  const animal = makeAnimal({
    shelterId,
    listing: { kind: "published", publishedAt: confirmedAt, confirmedAt, undoable: null },
  });
  await animalRepo(db).insert(animal, cityId);
  return animal;
}

async function insertUser(name: string): Promise<string> {
  const id = uuid();
  await db.insert(authUser).values({
    id,
    name,
    email: `${id}@example.org`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

async function organizationFor(shelterId: ShelterId): Promise<string> {
  const id = uuid();
  await db.insert(authOrganization).values({ id, name: id, slug: id, createdAt: NOW });
  await db.update(shelters).set({ organizationId: id }).where(eq(shelters.id, shelterId));
  return id;
}

async function invitation(
  organizationId: string,
  inviterId: string,
  status: "pending" | "accepted",
): Promise<string> {
  const id = uuid();
  await db.insert(authInvitation).values({
    id,
    organizationId,
    email: `${id}@example.org`,
    role: "admin",
    status,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    createdAt: NOW,
    inviterId,
  });
  return id;
}

const createdBy = (userId: string, invitationId: string) =>
  db.insert(invitationCreatedUsers).values({ userId, invitationId, createdAt: NOW });

const member = (organizationId: string, userId: string) =>
  db
    .insert(authMember)
    .values({ id: uuid(), organizationId, userId, role: "admin", createdAt: NOW });

/**
 * Production as it stands after step 4: two demo shelters with their corpus,
 * one of them with an organization, the step-4 test user (membership removed,
 * so only the invitation links it), and a real shelter with its own corpus,
 * admin and pending invitation.
 */
async function productionAfterStep4() {
  const operator = await insertUser("Оператор");
  await db.insert(superAdmins).values({ id: uuid(), userId: operator, grantedAt: NOW });

  const demoA = await insertShelter({ id: seedId(1), displayName: "Демо А", onTestKey: true });
  const demoB = await insertShelter({ id: seedId(2), displayName: "Демо Б", onTestKey: true });
  const real = await insertShelter();

  const demoAnimals = [
    await insertAnimal(demoA.id),
    await insertAnimal(demoA.id),
    await insertAnimal(demoB.id),
  ];
  const realAnimal = await insertAnimal(real.id);
  const [firstDemoAnimal] = demoAnimals;
  if (firstDemoAnimal === undefined) throw new Error("no demo animal");

  const visitor = makeAdopter();
  await adopterRepo(db).insert(visitor);
  for (const animal of [...demoAnimals, realAnimal]) {
    await swipeRepo(db).record({
      adopterId: visitor.id,
      animalId: animal.id,
      direction: "pass",
      at: NOW,
    });
  }
  const demoReveal = makeReveal({
    adopterId: visitor.id,
    animalId: firstDemoAnimal.id,
    shelterId: demoA.id,
  });
  const realReveal = makeReveal({
    adopterId: visitor.id,
    animalId: realAnimal.id,
    shelterId: real.id,
  });
  await revealRepo(db).insert(demoReveal);
  await revealRepo(db).insert(realReveal);

  await recordAnimalsImported(db, demoA.id, 2, ACTOR);
  await recordAnimalsImported(db, demoB.id, 1, ACTOR);
  await recordAnimalsImported(db, real.id, 1, ACTOR);

  await db.insert(supportSessions).values({
    id: uuid(),
    operatorUserId: operator,
    shelterId: demoA.id,
    tokenHash: uuid(),
    startedAt: NOW,
    lastSeenAt: NOW,
  });

  // Demo A: the step-4 test invite, accepted, its membership since removed.
  const demoOrg = await organizationFor(demoA.id);
  const testInvite = await invitation(demoOrg, operator, "accepted");
  const testUser = await insertUser("Тест");
  await createdBy(testUser, testInvite);
  await db.insert(authSession).values({
    id: uuid(),
    token: uuid(),
    userId: testUser,
    expiresAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await invitation(demoOrg, operator, "pending");

  // A user created by a demo invitation who has since joined the real shelter: kept.
  const realOrg = await organizationFor(real.id);
  const movedOn = await insertUser("Перейшла");
  await createdBy(movedOn, await invitation(demoOrg, operator, "accepted"));
  await member(realOrg, movedOn);

  // The real shelter's own admin and a pending invitation: kept.
  const realAdmin = await insertUser("Адмін");
  await createdBy(realAdmin, await invitation(realOrg, operator, "accepted"));
  await member(realOrg, realAdmin);
  const realPending = await invitation(realOrg, operator, "pending");

  return {
    operator,
    demoA,
    demoB,
    real,
    demoAnimals,
    realAnimal,
    visitor,
    realReveal,
    demoOrg,
    realOrg,
    testUser,
    movedOn,
    realAdmin,
    realPending,
  };
}

const rows = async <T>(query: Promise<T[]>) => (await query).length;

describe("demo:remove, the plan (dry run)", () => {
  it("names the demo shelters and counts exactly the corpus, the step-4 user included", async () => {
    const f = await productionAfterStep4();
    const plan = await planDemoRemoval(db, testKey);
    expect(plan.refusals).toEqual([]);
    expect(plan.demoShelters).toEqual([
      { id: seedId(1), displayName: "Демо А" },
      { id: seedId(2), displayName: "Демо Б" },
    ]);
    expect(plan.otherShelters).toBe(1);
    expect(plan.counts).toEqual({
      swipes: 3,
      reveals: 1,
      animals: 3,
      shelter_history: 2,
      support_sessions: 1,
      shelters: 2,
      auth_invitation: 3,
      auth_organization: 1,
      auth_user: 1,
    });
    expect(plan.demoMembers).toBe(0);
    // The test user's and the moved-on user's invitation rows; the test user's session.
    expect(plan.cascades).toEqual({
      invitation_created_users: 2,
      auth_session: 1,
      auth_account: 0,
    });
    const printed = formatPlan(plan, "Would delete").join("\n");
    expect(printed).toContain(`${seedId(1)}  Демо А`);
    expect(printed).toContain("Other shelters: 1 (they stay)");
    // The real shelter is counted, never named.
    expect(printed).not.toContain(f.real.displayName);
  });

  it("keeps a user created by a demo invitation who has since been invited to a real shelter", async () => {
    const f = await productionAfterStep4();
    const reinvited = await insertUser("Запрошена знову");
    await createdBy(reinvited, await invitation(f.demoOrg, f.operator, "accepted"));
    const [user] = await db
      .select({ email: authUser.email })
      .from(authUser)
      .where(eq(authUser.id, reinvited));
    if (user === undefined) throw new Error("no user");
    await db.insert(authInvitation).values({
      id: uuid(),
      organizationId: f.realOrg,
      email: user.email,
      role: "admin",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      createdAt: NOW,
      inviterId: f.operator,
    });
    expect((await planDemoRemoval(db, testKey)).counts.auth_user).toBe(1);
    expect((await removeDemoCorpus(db, testKey)).kind).toBe("removed");
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, reinvited)))).toBe(1);
    expect(await rows(db.select().from(authUser).where(eq(authUser.id, f.testUser)))).toBe(0);
  });

  it("writes nothing", async () => {
    await productionAfterStep4();
    await planDemoRemoval(db, testKey);
    expect(await rows(db.select().from(shelters))).toBe(3);
    expect(await rows(db.select().from(animals))).toBe(4);
  });
});

describe("demo:remove, the commit", () => {
  it("deletes the corpus in one go and leaves the real shelter, its data, the operator and cities", async () => {
    const f = await productionAfterStep4();
    const result = await removeDemoCorpus(db, testKey);
    if (result.kind !== "removed") throw new Error(`expected removed, got ${result.kind}`);
    expect(result.deleted).toEqual(result.plan.counts);

    expect((await db.select({ id: shelters.id }).from(shelters)).map((s) => s.id)).toEqual([
      f.real.id,
    ]);
    expect((await db.select({ id: animals.id }).from(animals)).map((a) => a.id)).toEqual([
      f.realAnimal.id,
    ]);
    expect((await db.select({ id: swipes.animalId }).from(swipes)).map((s) => s.id)).toEqual([
      f.realAnimal.id,
    ]);
    expect((await db.select({ id: reveals.id }).from(reveals)).map((r) => r.id)).toEqual([
      f.realReveal.id,
    ]);
    expect(
      (await db.select({ id: shelterHistory.shelterId }).from(shelterHistory)).map((h) => h.id),
    ).toEqual([f.real.id]);
    expect(await rows(db.select().from(supportSessions))).toBe(0);
    expect(
      (await db.select({ id: authOrganization.id }).from(authOrganization)).map((o) => o.id),
    ).toEqual([f.realOrg]);
    expect(await rows(db.select().from(authMember))).toBe(2);
    expect(
      await rows(
        db.select().from(authInvitation).where(eq(authInvitation.organizationId, f.demoOrg)),
      ),
    ).toBe(0);
    expect(
      await rows(db.select().from(authInvitation).where(eq(authInvitation.id, f.realPending))),
    ).toBe(1);

    const users = (await db.select({ id: authUser.id }).from(authUser)).map((u) => u.id).sort();
    expect(users).toEqual([f.operator, f.movedOn, f.realAdmin].sort());
    expect(await rows(db.select().from(cities))).toBe(1);
    expect(await adopterRepo(db).findById(f.visitor.id)).not.toBeNull();
  });

  it("a second run finds nothing: every count 0, no refusal", async () => {
    await productionAfterStep4();
    await removeDemoCorpus(db, testKey);
    const again = await planDemoRemoval(db, testKey);
    expect(again.demoShelters).toEqual([]);
    expect(again.counts).toEqual(ZERO);
    expect(again.refusals).toEqual([]);
    expect((await removeDemoCorpus(db, testKey)).kind).toBe("nothing_to_remove");
  });

  /**
   * DR-B1, answer 1: a visitor whose deck or cursor still points at a deleted
   * demo animal gets the next card, not an error. The feed keyset needs only
   * the cursor's values, never the row they came from.
   */
  it("a feed cursor taken on a demo animal still pages on to the real one", async () => {
    const demo = await insertShelter({ id: seedId(1), onTestKey: true });
    const real = await insertShelter();
    await insertAnimal(demo.id, NOW);
    const realAnimal = await insertAnimal(real.id, EARLIER);
    const list = (cursor: { confirmedAt: Date; id: string } | null) =>
      feedRepo(db).list({
        filters: NO_FILTERS,
        cursor,
        limit: 1,
        adopterId: null,
        now: NOW,
        seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
      });
    const first = await list(null);
    expect(first.items.map((a) => a.shelterId)).toEqual([demo.id]);
    if (first.nextCursor === null) throw new Error("expected a second page");

    expect((await removeDemoCorpus(db, testKey)).kind).toBe("removed");

    const next = await list(first.nextCursor);
    expect(next.items.map((a) => a.id)).toEqual([realAnimal.id]);
  });
});

describe("demo:remove refuses, and deletes nothing", () => {
  const nothingDeleted = async () => {
    expect(await rows(db.select().from(shelters))).toBeGreaterThan(0);
    expect(
      await rows(
        db
          .select()
          .from(animals)
          .where(inArray(animals.shelterId, [seedId(1)])),
      ),
    ).toBe(1);
  };

  it("when no shelter outside the demo range exists (the site would be empty)", async () => {
    const demo = await insertShelter({ id: seedId(1), onTestKey: true });
    await insertAnimal(demo.id);
    const result = await removeDemoCorpus(db, testKey);
    expect(result.kind).toBe("refused");
    expect(result.plan.refusals).toEqual([{ kind: "no_real_shelter" }]);
    await nothingDeleted();
  });

  it("when a demo shelter still has a member", async () => {
    const demo = await insertShelter({ id: seedId(1), onTestKey: true });
    await insertAnimal(demo.id);
    await insertShelter();
    await member(await organizationFor(demo.id), await insertUser("Ще тут"));
    const result = await removeDemoCorpus(db, testKey);
    expect(result.plan.refusals).toEqual([{ kind: "demo_shelter_has_members", members: 1 }]);
    await nothingDeleted();
  });

  it("when a shelter outside the demo range is on the test-only key", async () => {
    const demo = await insertShelter({ id: seedId(1), onTestKey: true });
    await insertAnimal(demo.id);
    await insertShelter({ onTestKey: true });
    const result = await removeDemoCorpus(db, testKey);
    expect(result.plan.refusals).toEqual([{ kind: "test_key_on_real_shelter", shelters: 1 }]);
    await nothingDeleted();
  });

  it("when a reveal links a demo animal to a non-demo shelter", async () => {
    const demo = await insertShelter({ id: seedId(1), onTestKey: true });
    const demoAnimal = await insertAnimal(demo.id);
    const real = await insertShelter();
    const visitor = makeAdopter();
    await adopterRepo(db).insert(visitor);
    await revealRepo(db).insert(
      makeReveal({ adopterId: visitor.id, animalId: demoAnimal.id, shelterId: real.id }),
    );
    const result = await removeDemoCorpus(db, testKey);
    expect(result.plan.refusals).toEqual([{ kind: "reveal_crosses_the_corpus", reveals: 1 }]);
    await nothingDeleted();
  });
});

describe("demo:remove --expect (DR-B1, guard 3b)", () => {
  const url = (host: string) => `postgres://u:p@${host}/neondb`;
  const NEON = "ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech";

  it("passes only when the target's Neon compute is exactly --expect", () => {
    expect(expectedTargetOf(url(NEON), "ep-quiet-lake-a1b2c3")).toEqual({ kind: "ok" });
    expect(
      expectedTargetOf(
        url("ep-quiet-lake-a1b2c3-pooler.eu-central-1.aws.neon.tech"),
        "ep-quiet-lake-a1b2c3",
      ),
    ).toEqual({ kind: "ok" });
  });

  it("refuses a missing or malformed --expect, a non-Neon target and another compute", () => {
    expect(expectedTargetOf(url(NEON), undefined).kind).toBe("refused");
    expect(expectedTargetOf(url(NEON), "postgres://x").kind).toBe("refused");
    expect(expectedTargetOf(url("localhost:5432"), "ep-quiet-lake-a1b2c3").kind).toBe("refused");
    expect(expectedTargetOf(url(NEON), "ep-other-lake-a1b2c3").kind).toBe("refused");
  });

  it("never echoes the URL or its password in a refusal", () => {
    const refused = expectedTargetOf(
      `postgres://user:s3cret@${NEON}/neondb`,
      "ep-other-lake-a1b2c3",
    );
    if (refused.kind !== "refused") throw new Error("expected a refusal");
    expect(refused.reason).not.toContain("s3cret");
    expect(refused.reason).not.toContain(NEON);
  });
});

/**
 * The deletion is one transaction that checks each table's deleted count
 * against the plan made inside it. A trigger that silently skips one table's
 * deletes makes a real mismatch; the whole removal must roll back. The trigger
 * sits on `auth_user`, the last table: skipping its deletes breaks no foreign
 * key, so only the count check stands between it and a partial commit (review
 * of the pre-commit diff, finding 3).
 */
describe("demo:remove rolls back on any count that differs from its plan", () => {
  it("leaves every row in place when the last table deletes fewer rows than planned", async () => {
    await productionAfterStep4();
    await db.execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION demo_remove_test_skip() RETURNS trigger AS $$
        BEGIN RETURN NULL; END $$ LANGUAGE plpgsql;
        CREATE TRIGGER demo_remove_test_skip BEFORE DELETE ON auth_user
          FOR EACH ROW EXECUTE FUNCTION demo_remove_test_skip();
      `),
    );
    try {
      await expect(removeDemoCorpus(db, testKey)).rejects.toThrow(
        "auth_user deleted 0 row(s), planned 1; rolled back, nothing deleted",
      );
    } finally {
      await db.execute(
        sql.raw(
          "DROP TRIGGER demo_remove_test_skip ON auth_user; DROP FUNCTION demo_remove_test_skip();",
        ),
      );
    }
    // Everything before auth_user was deleted inside the transaction; all of it is back.
    expect(await rows(db.select().from(swipes))).toBe(4);
    expect(await rows(db.select().from(reveals))).toBe(2);
    expect(await rows(db.select().from(animals))).toBe(4);
    expect(await rows(db.select().from(shelters))).toBe(3);
    expect(await rows(db.select().from(authOrganization))).toBe(2);
  });
});
