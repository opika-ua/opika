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
  closingLine,
  DEMO_RANGE,
  DEMO_REMOVAL_TABLES,
  type DemoRemovalCounts,
  EmptyRemovalTarget,
  expectedTargetOf,
  formatPlan,
  formatRefusal,
  parseRemovalTarget,
  planDemoRemoval,
  type RemovalTarget,
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
  authAccount,
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

  // The operator viewed the real shelter in support mode: kept, and no obstacle.
  await db.insert(supportSessions).values({
    id: uuid(),
    operatorUserId: operator,
    shelterId: real.id,
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
  await db.insert(authAccount).values({
    id: uuid(),
    accountId: testUser,
    providerId: "email",
    userId: testUser,
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
      shelters: 2,
      auth_invitation: 3,
      auth_organization: 1,
      auth_user: 1,
    });
    expect(plan.demoMembers).toBe(0);
    expect(plan.demoSupportSessions).toBe(0);
    // The test user's and the moved-on user's invitation rows; the test user's session and account.
    expect(plan.cascades).toEqual({
      invitation_created_users: 2,
      auth_session: 1,
      auth_account: 1,
    });
    const printed = formatPlan(plan, "Would delete").join("\n");
    expect(printed).toContain(`${seedId(1)}  Демо А`);
    expect(printed).toContain("Other shelters: 1 (they stay)");
    expect(printed).toContain(
      "Support sessions on demo shelters: 0 (never deleted; any is a refusal)",
    );
    expect(printed).toContain("Removed with them by cascade:");
    expect(printed).toMatch(/^ {2}auth_session +1$/m);
    expect(printed).toMatch(/^ {2}auth_account +1$/m);
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
    // RS-Q0: support sessions are never deleted; the real shelter's is still there.
    expect(await rows(db.select().from(supportSessions))).toBe(1);
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

  it("when a demo shelter has a support session (RS-Q0: never deleted; DR-Q1)", async () => {
    const demo = await insertShelter({ id: seedId(1), onTestKey: true });
    await insertAnimal(demo.id);
    await insertShelter();
    await db.insert(supportSessions).values({
      id: uuid(),
      operatorUserId: await insertUser("Оператор"),
      shelterId: demo.id,
      tokenHash: uuid(),
      startedAt: NOW,
      lastSeenAt: NOW,
    });
    const result = await removeDemoCorpus(db, testKey);
    expect(result.plan.refusals).toEqual([
      { kind: "demo_shelter_has_support_sessions", sessions: 1 },
    ]);
    expect(await rows(db.select().from(supportSessions))).toBe(1);
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
/**
 * `--shelter <id>` (DR-F2; Oleksii's answers in DR-B3): the same removal,
 * pointed at exactly the listed shelters (his own test shelters, outside the
 * seed range, on the real key) and at nothing else. Every expected value here
 * is written out, not derived from the code under test.
 */
describe("demo:remove --shelter: exactly these shelters", () => {
  const shelterTarget = (...ids: string[]): RemovalTarget => ({ kind: "shelters", ids });
  const realPhoto = (key: string) => ({ storageKey: key, width: 1024, height: 768, alt: null });
  const byId = <T extends { id: string }>(list: readonly T[]) =>
    [...list].sort((a, b) => a.id.localeCompare(b.id));

  async function insertAnimalWithPhotos(shelterId: ShelterId, keys: readonly string[]) {
    const animal = makeAnimal({
      shelterId,
      photos: keys.map(realPhoto),
      listing: { kind: "published", publishedAt: NOW, confirmedAt: NOW, undoable: null },
    });
    await animalRepo(db).insert(animal, cityId);
    return animal;
  }

  /**
   * Production after step 4 plus two of Oleksii's test shelters: the first
   * with an organization, an accepted invitation whose user has since lost
   * the membership, an animal with two real R2 photos and a seed photo, a
   * swipe, a reveal and history; the second bare. A user created by a test
   * invitation and since invited (by address) to a demo shelter must stay:
   * a demo shelter is "elsewhere" when it isn't targeted.
   */
  async function withTestShelters() {
    const f = await productionAfterStep4();
    const testA = await insertShelter({ displayName: "Мій перший тест" });
    const testB = await insertShelter({ displayName: "Мій другий тест" });
    const photoAnimal = await insertAnimalWithPhotos(testA.id, [
      "animals/photo-animal/0",
      "seed-photos/dog-1.jpg",
      "animals/photo-animal/1",
    ]);
    const bareAnimal = await insertAnimal(testB.id);
    await swipeRepo(db).record({
      adopterId: f.visitor.id,
      animalId: photoAnimal.id,
      direction: "interested",
      at: NOW,
    });
    await revealRepo(db).insert(
      makeReveal({ adopterId: f.visitor.id, animalId: photoAnimal.id, shelterId: testA.id }),
    );
    await recordAnimalsImported(db, testA.id, 1, ACTOR);

    const testOrg = await organizationFor(testA.id);
    const testOnlyUser = await insertUser("Тест А");
    await createdBy(testOnlyUser, await invitation(testOrg, f.operator, "accepted"));
    const invitedToDemo = await insertUser("Запрошена до демо");
    await createdBy(invitedToDemo, await invitation(testOrg, f.operator, "accepted"));
    const [user] = await db
      .select({ email: authUser.email })
      .from(authUser)
      .where(eq(authUser.id, invitedToDemo));
    if (user === undefined) throw new Error("no user");
    await db.insert(authInvitation).values({
      id: uuid(),
      organizationId: f.demoOrg,
      email: user.email,
      role: "admin",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      createdAt: NOW,
      inviterId: f.operator,
    });
    return { ...f, testA, testB, photoAnimal, bareAnimal, testOrg, testOnlyUser, invitedToDemo };
  }

  it("plans exactly the given shelters, names them, and counts the rest without naming them", async () => {
    const f = await withTestShelters();
    const plan = await planDemoRemoval(db, testKey, shelterTarget(f.testA.id, f.testB.id));
    expect(plan.refusals).toEqual([]);
    expect(byId(plan.demoShelters)).toEqual(
      byId([
        { id: f.testA.id, displayName: "Мій перший тест" },
        { id: f.testB.id, displayName: "Мій другий тест" },
      ]),
    );
    // Демо А, Демо Б and the real shelter stay.
    expect(plan.otherShelters).toBe(3);
    expect(plan.counts).toEqual({
      swipes: 1,
      reveals: 1,
      animals: 2,
      shelter_history: 1,
      shelters: 2,
      auth_invitation: 2,
      auth_organization: 1,
      auth_user: 1,
    });
    const printed = formatPlan(plan, "Would delete").join("\n");
    expect(printed).toContain("Target shelters (2):");
    expect(printed).toContain(`${f.testA.id}  Мій перший тест`);
    expect(printed).toContain(`${f.testB.id}  Мій другий тест`);
    expect(printed).toContain("Other shelters: 3 (they stay)");
    expect(printed).toContain(
      "Support sessions on target shelters: 0 (never deleted; any is a refusal)",
    );
    expect(printed).not.toContain("Демо А");
    expect(printed).not.toContain(f.real.displayName);
    expect(printed).not.toContain(f.real.id);
  });

  it("lists the R2 keys of every variant of the target animals' real photos, never a seed photo", async () => {
    const f = await withTestShelters();
    const plan = await planDemoRemoval(db, testKey, shelterTarget(f.testA.id, f.testB.id));
    expect(plan.photoObjectKeys).toEqual([
      "animals/photo-animal/0/thumb.webp",
      "animals/photo-animal/0/card.webp",
      "animals/photo-animal/0/detail.webp",
      "animals/photo-animal/1/thumb.webp",
      "animals/photo-animal/1/card.webp",
      "animals/photo-animal/1/detail.webp",
    ]);
    const printed = formatPlan(plan, "Would delete");
    expect(printed).toContain(
      "R2 photo objects of these animals: 6 (left in R2, unlinked; delete by hand in Cloudflare if wanted)",
    );
    expect(printed).toContain("  animals/photo-animal/1/detail.webp");
    expect(printed.join("\n")).not.toContain("seed-photos");

    // A target with no real photo still says so; a seed-range run prints no photo section at all.
    const bare = await planDemoRemoval(db, testKey, shelterTarget(f.testB.id));
    expect(formatPlan(bare, "Would delete")).toContain(
      "R2 photo objects of these animals: 0 (left in R2, unlinked; delete by hand in Cloudflare if wanted)",
    );
    const demo = await planDemoRemoval(db, testKey, DEMO_RANGE);
    expect(formatPlan(demo, "Would delete").join("\n")).not.toContain("R2 photo objects");
  });

  it("deletes the targets and what hangs off them, and leaves the demo corpus and the real shelter alone", async () => {
    const f = await withTestShelters();
    const result = await removeDemoCorpus(db, testKey, shelterTarget(f.testA.id, f.testB.id));
    if (result.kind !== "removed") throw new Error(`expected removed, got ${result.kind}`);
    expect(result.deleted).toEqual(result.plan.counts);

    const shelterIds = (await db.select({ id: shelters.id }).from(shelters)).map((s) => s.id);
    expect(shelterIds.sort()).toEqual([f.demoA.id, f.demoB.id, f.real.id].sort());
    const animalIds = (await db.select({ id: animals.id }).from(animals)).map((a) => a.id);
    expect(animalIds.sort()).toEqual([...f.demoAnimals.map((a) => a.id), f.realAnimal.id].sort());
    // #103's fixture: 4 swipes, 2 reveals, 3 history rows; the test shelter's are gone.
    expect(await rows(db.select().from(swipes))).toBe(4);
    expect(await rows(db.select().from(reveals))).toBe(2);
    expect(await rows(db.select().from(shelterHistory))).toBe(3);
    const orgs = (await db.select({ id: authOrganization.id }).from(authOrganization)).map(
      (o) => o.id,
    );
    expect(orgs.sort()).toEqual([f.demoOrg, f.realOrg].sort());
    // The demo invitations (3 from #103's fixture, plus the one to invitedToDemo) stay.
    expect(
      await rows(
        db.select().from(authInvitation).where(eq(authInvitation.organizationId, f.demoOrg)),
      ),
    ).toBe(4);
    // Only the user whose only link was the test invitation goes; the demo step-4 user isn't targeted.
    const users = (await db.select({ id: authUser.id }).from(authUser)).map((u) => u.id).sort();
    expect(users).toEqual([f.operator, f.testUser, f.movedOn, f.realAdmin, f.invitedToDemo].sort());
    expect(await rows(db.select().from(supportSessions))).toBe(1);
    expect(await rows(db.select().from(cities))).toBe(1);
  });

  it("a second run with the same ids deletes nothing: every count 0, and the ids are reported gone", async () => {
    const f = await withTestShelters();
    const target = shelterTarget(f.testA.id, f.testB.id);
    expect((await removeDemoCorpus(db, testKey, target)).kind).toBe("removed");
    const again = await planDemoRemoval(db, testKey, target);
    expect(again.demoShelters).toEqual([]);
    expect(again.counts).toEqual(ZERO);
    expect(again.photoObjectKeys).toEqual([]);
    expect(again.refusals).toEqual([{ kind: "target_not_found", ids: [f.testA.id, f.testB.id] }]);
    expect((await removeDemoCorpus(db, testKey, target)).kind).toBe("refused");
  });

  describe("refuses, and deletes nothing", () => {
    const stillThere = async (...ids: string[]) => {
      expect(
        await rows(
          db
            .select()
            .from(shelters)
            .where(inArray(shelters.id, ids as ShelterId[])),
        ),
      ).toBe(ids.length);
    };
    const firstRefusalText = (plan: Awaited<ReturnType<typeof planDemoRemoval>>) => {
      const [refusal] = plan.refusals;
      if (refusal === undefined) throw new Error("expected a refusal");
      return formatRefusal(refusal, plan.target);
    };

    it("an id inside the demo range", async () => {
      const f = await withTestShelters();
      const result = await removeDemoCorpus(db, testKey, shelterTarget(f.testA.id, f.demoA.id));
      expect(result.kind).toBe("refused");
      expect(result.plan.refusals).toEqual([{ kind: "target_in_demo_range", ids: [f.demoA.id] }]);
      expect(firstRefusalText(result.plan)).toBe(
        `REFUSED: ${f.demoA.id} lie(s) in the demo range; run without --shelter to remove the demo corpus.`,
      );
      await stillThere(f.testA.id, f.demoA.id);
    });

    it("an id that names no shelter", async () => {
      const f = await withTestShelters();
      const ghost = "0f0f0f0f-0000-4000-8000-000000000000";
      const result = await removeDemoCorpus(db, testKey, shelterTarget(f.testA.id, ghost));
      expect(result.plan.refusals).toEqual([{ kind: "target_not_found", ids: [ghost] }]);
      await stillThere(f.testA.id);
    });

    it("when no shelter at all would remain", async () => {
      const only = await insertShelter({ displayName: "Єдиний тестовий" });
      await insertAnimal(only.id);
      const result = await removeDemoCorpus(db, testKey, shelterTarget(only.id));
      expect(result.plan.refusals).toEqual([{ kind: "no_shelter_would_remain" }]);
      expect(result.plan.otherShelters).toBe(0);
      await stillThere(only.id);
    });

    it("but not when only demo shelters would remain: they are shelters that stay", async () => {
      await insertShelter({ id: seedId(1), onTestKey: true });
      const test = await insertShelter();
      const plan = await planDemoRemoval(db, testKey, shelterTarget(test.id));
      expect(plan.refusals).toEqual([]);
      expect(plan.otherShelters).toBe(1);
    });

    it("when a target shelter still has a member (remove admins first)", async () => {
      const f = await withTestShelters();
      await member(f.testOrg, await insertUser("Ще адмін"));
      const result = await removeDemoCorpus(db, testKey, shelterTarget(f.testA.id));
      expect(result.plan.refusals).toEqual([{ kind: "demo_shelter_has_members", members: 1 }]);
      expect(firstRefusalText(result.plan)).toBe(
        "REFUSED: 1 member(s) still belong to a target shelter; remove them with registry/admins/remove first.",
      );
      await stillThere(f.testA.id);
    });

    it("when a target shelter has a support session (RS-Q0)", async () => {
      const f = await withTestShelters();
      await db.insert(supportSessions).values({
        id: uuid(),
        operatorUserId: f.operator,
        shelterId: f.testB.id,
        tokenHash: uuid(),
        startedAt: NOW,
        lastSeenAt: NOW,
      });
      const result = await removeDemoCorpus(db, testKey, shelterTarget(f.testA.id, f.testB.id));
      expect(result.plan.refusals).toEqual([
        { kind: "demo_shelter_has_support_sessions", sessions: 1 },
      ]);
      expect(await rows(db.select().from(supportSessions))).toBe(2);
      await stillThere(f.testA.id, f.testB.id);
    });

    it("when a reveal links a target animal to a shelter not targeted", async () => {
      const f = await withTestShelters();
      await revealRepo(db).insert(
        makeReveal({ adopterId: f.visitor.id, animalId: f.bareAnimal.id, shelterId: f.real.id }),
      );
      const result = await removeDemoCorpus(db, testKey, shelterTarget(f.testB.id));
      expect(result.plan.refusals).toEqual([{ kind: "reveal_crosses_the_corpus", reveals: 1 }]);
      await stillThere(f.testB.id);
    });

    it("when a shelter outside the demo range is on the test-only key (the check is unchanged)", async () => {
      const f = await withTestShelters();
      await insertShelter({ onTestKey: true });
      const result = await removeDemoCorpus(db, testKey, shelterTarget(f.testB.id));
      expect(result.plan.refusals).toEqual([{ kind: "test_key_on_real_shelter", shelters: 1 }]);
      await stillThere(f.testB.id);
    });
  });

  it("rolls back whole when a count differs from its plan, as for the seed range", async () => {
    const f = await withTestShelters();
    await db.execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION demo_remove_test_skip() RETURNS trigger AS $$
        BEGIN RETURN NULL; END $$ LANGUAGE plpgsql;
        CREATE TRIGGER demo_remove_test_skip BEFORE DELETE ON auth_user
          FOR EACH ROW EXECUTE FUNCTION demo_remove_test_skip();
      `),
    );
    try {
      await expect(
        removeDemoCorpus(db, testKey, shelterTarget(f.testA.id, f.testB.id)),
      ).rejects.toThrow("auth_user deleted 0 row(s), planned 1; rolled back, nothing deleted");
    } finally {
      await db.execute(
        sql.raw(
          "DROP TRIGGER demo_remove_test_skip ON auth_user; DROP FUNCTION demo_remove_test_skip();",
        ),
      );
    }
    expect(await rows(db.select().from(shelters))).toBe(5);
    expect(await rows(db.select().from(animals))).toBe(6);
  });

  it("an empty id list from a direct caller throws before any SQL, never an IN () syntax error", async () => {
    await withTestShelters();
    await expect(planDemoRemoval(db, testKey, shelterTarget())).rejects.toBeInstanceOf(
      EmptyRemovalTarget,
    );
    await expect(removeDemoCorpus(db, testKey, shelterTarget())).rejects.toThrow(
      "demo:remove: a shelters target needs at least one id; nothing was run",
    );
    expect(await rows(db.select().from(shelters))).toBe(5);
    expect(await rows(db.select().from(animals))).toBe(6);
  });
});

describe("demo:remove, the closing line of a committed run", () => {
  it("for the seed range is unchanged", () => {
    expect(closingLine(DEMO_RANGE)).toBe("Done. Run the dry run again: every count should be 0.");
  });

  it("for --shelter says the next dry run refuses each removed id as not found, and that this confirms it", () => {
    const A = "0a0a0a0a-0000-4000-8000-00000000000a";
    const B = "0b0b0b0b-0000-4000-8000-00000000000b";
    expect(closingLine({ kind: "shelters", ids: [A, B] })).toBe(
      `Done. Run the dry run again with the same --shelter ids: every count should be 0, and it refuses with "REFUSED: no shelter has id ${A}, ${B}." That refusal is the confirmation that they are gone.`,
    );
  });
});

describe("demo:remove argv: --shelter", () => {
  const A = "0a0a0a0a-0000-4000-8000-00000000000a";
  const B = "0b0b0b0b-0000-4000-8000-00000000000b";
  const argv = (...args: string[]) => ["node", "demo-remove.ts", "--expect", "ep-x", ...args];
  const refusedWith = (args: string[], reason: string) =>
    expect(parseRemovalTarget(argv(...args))).toEqual({ kind: "refused", reason });

  it("without --shelter targets the seed range, as before", () => {
    expect(parseRemovalTarget(argv("--commit", "--prod"))).toEqual({ kind: "demo_range" });
  });

  it("is repeatable, and reads ids in the case they are minted in", () => {
    expect(
      parseRemovalTarget(argv("--shelter", A, "--commit", "--shelter", B.toUpperCase())),
    ).toEqual({ kind: "shelters", ids: [A, B] });
  });

  it("refuses --shelter with no value, at the end or before another flag", () => {
    refusedWith(["--shelter"], "--shelter needs a shelter id after it");
    refusedWith(["--shelter", "--commit"], "--shelter needs a shelter id after it");
    refusedWith(["--shelter", A, "--shelter"], "--shelter needs a shelter id after it");
  });

  it("refuses --shelter=<id> rather than ignoring it and falling back to the seed range", () => {
    refusedWith([`--shelter=${A}`], "write --shelter <id>, not --shelter=<id>");
  });

  it("refuses an id that isn't a UUID", () => {
    refusedWith(
      ["--shelter", "rehearsal-shelter"],
      "--shelter rehearsal-shelter is not a shelter id (a UUID)",
    );
  });

  it("refuses a pasted connection string as the id without printing it", () => {
    const pasted = "postgres://u:hunter2@ep-x.neon.tech/db";
    const result = parseRemovalTarget(["node", "demo-remove.ts", "--shelter", pasted]);
    if (result.kind !== "refused") throw new Error(`expected a refusal, got ${result.kind}`);
    expect(result.reason).toBe("--shelter (argument 2) is not a shelter id (a UUID)");
    expect(result.reason).not.toContain("hunter2");
  });

  it("refuses an id given twice, whatever its case", () => {
    refusedWith(["--shelter", A, "--shelter", A.toUpperCase()], `--shelter ${A} is given twice`);
  });

  it("takes the runbook's full command line", () => {
    expect(parseRemovalTarget(argv("--prod", "--shelter", A, "--commit"))).toEqual({
      kind: "shelters",
      ids: [A],
    });
  });

  it("refuses a mistyped --shelter rather than falling back to the seed range", () => {
    const takes = "it takes --expect <ep>, --commit, --prod and --shelter <id>";
    refusedWith(
      ["--shelters", A, "--commit"],
      `--shelters is not an argument this script takes; ${takes}`,
    );
    refusedWith(["--Shelter", A], `--Shelter is not an argument this script takes; ${takes}`);
    refusedWith(["--shelter-id", A], `--shelter-id is not an argument this script takes; ${takes}`);
    refusedWith(["-shelter", A], `-shelter is not an argument this script takes; ${takes}`);
    refusedWith(["--commt"], `--commt is not an argument this script takes; ${takes}`);
  });

  it("refuses a stray positional argument, without echoing it (it may be a pasted URL)", () => {
    const takes = "it takes --expect <ep>, --commit, --prod and --shelter <id>";
    refusedWith(["--commit", A], `argument 4 is not one this script takes; ${takes}`);
    const pasted = parseRemovalTarget(argv("postgres://u:hunter2@ep-x.neon.tech/db"));
    expect(pasted).toEqual({
      kind: "refused",
      reason: `argument 3 is not one this script takes; ${takes}`,
    });
    expect(JSON.stringify(pasted)).not.toContain("hunter2");
  });

  it("refuses --expect with no value, or given twice", () => {
    expect(parseRemovalTarget(["node", "demo-remove.ts", "--expect"])).toEqual({
      kind: "refused",
      reason: "--expect needs an endpoint id after it",
    });
    expect(parseRemovalTarget(["node", "demo-remove.ts", "--expect", "--commit"])).toEqual({
      kind: "refused",
      reason: "--expect needs an endpoint id after it",
    });
    refusedWith(["--expect", "ep-y"], "--expect is given twice");
  });
});
