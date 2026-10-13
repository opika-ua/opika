import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AdminDeps, runAdmin } from "../src/admin";
import { createDatabaseWithClient } from "../src/client";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetActorRepo } from "../src/repos/kabinet-actor-repo";
import { INVITATION_TTL_MS, kabinetInvitationRepo } from "../src/repos/kabinet-invitation-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { superAdminRepo } from "../src/repos/super-admin-repo";
import { authMember, authUser, superAdmins } from "../src/schema/auth";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * The operator scripts (HS-Q4, RG-Q2, RS-Q1), through `runAdmin`: what each
 * writes, what each refuses, and that a declined confirmation writes nothing.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-13T10:00:00.000Z");

function deps(answer: boolean, now = NOW): AdminDeps & { lines: string[]; asked: string[] } {
  const lines: string[] = [];
  const asked: string[] = [];
  return {
    db,
    now,
    newId: () => crypto.randomUUID(),
    confirm: async (question) => {
      asked.push(question);
      return answer;
    },
    log: (line) => lines.push(line),
    lines,
    asked,
  };
}

const grants = () => db.select().from(superAdmins);
const userByEmail = async (email: string) =>
  (await db.select().from(authUser).where(eq(authUser.email, email)))[0];

async function user(email: string) {
  const id = crypto.randomUUID();
  await db.insert(authUser).values({
    id,
    name: "Олена",
    email,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

describe("admin:bootstrap (RG-Q2)", () => {
  it("creates the user and the grant, and the user resolves as super_admin", async () => {
    const d = deps(true);
    expect(await runAdmin("bootstrap", [" Oleksii@Example.org "], d)).toBe(0);
    const created = await userByEmail("oleksii@example.org");
    expect(created).toMatchObject({ emailVerified: false });
    expect(await grants()).toEqual([
      expect.objectContaining({ userId: created?.id, revokedAt: null }),
    ]);
    expect(await kabinetActorRepo(db).roleOf(created?.id ?? "")).toEqual({
      kind: "super_admin",
      moderatorId: created?.id,
    });
    expect(d.lines).toContain("Email: oleksii@example.org");
  });

  it("refuses once any active operator exists, before asking, writing nothing", async () => {
    await runAdmin("bootstrap", ["first@example.org"], deps(true));
    const d = deps(true);
    expect(await runAdmin("bootstrap", ["second@example.org"], d)).toBe(1);
    expect(d.asked).toEqual([]);
    expect(await userByEmail("second@example.org")).toBeUndefined();
    expect(await grants()).toHaveLength(1);
  });

  /**
   * Two runs at once, on two connections: each statement's NOT EXISTS sees no
   * operator, so only the fixed grant id's primary key stops the second
   * (review of the scripts row, finding 2). Exactly one operator, and the
   * loser's user rolled back with it.
   */
  it("lets exactly one of two concurrent bootstraps through", async () => {
    const secondClient = postgres(TEST_DATABASE_URL, { max: 1 });
    const second = createDatabaseWithClient(secondClient);
    let raced: Promise<unknown> = Promise.resolve();
    // The first runs inside a transaction held open, so its operator is not
    // yet visible: the second's NOT EXISTS passes, exactly the race. Only the
    // fixed grant id makes the second wait on the first's row, then fail.
    await db.transaction(async (tx) => {
      const first = await superAdminRepo(tx as never).bootstrap({
        userId: crypto.randomUUID(),
        email: "one@example.org",
        name: "Один",
        now: NOW,
      });
      expect(first.kind).toBe("bootstrapped");
      raced = superAdminRepo(second).bootstrap({
        userId: crypto.randomUUID(),
        email: "two@example.org",
        name: "Два",
        now: NOW,
      });
      // Wait until the second really is blocked on the first's row: a test
      // that only sleeps could start the second after the commit and pass
      // without racing (re-review, note 2).
      const watcherClient = postgres(TEST_DATABASE_URL, { max: 1 });
      const watcher = createDatabaseWithClient(watcherClient);
      for (let waited = 0; ; waited += 50) {
        const [row] = await watcher.execute<{ waiting: number }>(
          sql`SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`,
        );
        if (Number(row?.waiting) > 0) break;
        if (waited > 5000) throw new Error("the second bootstrap never waited on the first");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await watcherClient.end();
    });
    expect(await raced).toEqual({ kind: "refused", reason: "already_bootstrapped" });
    await secondClient.end();
    expect(await grants()).toHaveLength(1);
    expect((await db.select().from(authUser)).map((u) => u.email)).toEqual(["one@example.org"]);
  });

  /** The statement itself refuses, run after an operator exists (not only the script's pre-check). */
  it("refuses in the write itself when an operator exists, creating no user", async () => {
    await runAdmin("bootstrap", ["first@example.org"], deps(true));
    const result = await superAdminRepo(db).bootstrap({
      userId: crypto.randomUUID(),
      email: "second@example.org",
      name: "Друга",
      now: NOW,
    });
    expect(result).toEqual({ kind: "refused", reason: "operator_exists" });
    expect(await userByEmail("second@example.org")).toBeUndefined();
  });

  it("refuses an address that already has a user", async () => {
    await user("taken@example.org");
    expect(await runAdmin("bootstrap", ["taken@example.org"], deps(true))).toBe(1);
    expect(await grants()).toEqual([]);
  });

  it("writes nothing when the operator doesn't type yes", async () => {
    expect(await runAdmin("bootstrap", ["oleksii@example.org"], deps(false))).toBe(1);
    expect(await userByEmail("oleksii@example.org")).toBeUndefined();
    expect(await grants()).toEqual([]);
  });

  it("asks for an email rather than guessing", async () => {
    const d = deps(true);
    expect(await runAdmin("bootstrap", ["--prod"], d)).toBe(1);
    expect(d.lines[0]).toMatch(/^Usage: admin:bootstrap <email>/);
  });
});

describe("admin:grant / admin:revoke (HS-Q4)", () => {
  it("grants an existing user, refuses a second grant, and refuses an unknown address", async () => {
    const id = await user("olena@example.org");
    expect(await runAdmin("grant", ["olena@example.org"], deps(true))).toBe(0);
    expect(await runAdmin("grant", ["olena@example.org"], deps(true))).toBe(1);
    expect(await runAdmin("grant", ["nobody@example.org"], deps(true))).toBe(1);
    expect((await grants()).map((grant) => grant.userId)).toEqual([id]);
  });

  it("refuses to make a shelter's admin an operator", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const operator = await user("op@example.org");
    const invited = await kabinetInvitationRepo(db).invite({
      shelterId: shelter.id,
      email: "admin@example.org",
      name: "Адмін",
      inviterUserId: operator,
      ids: { invitationId: "inv-1", userId: crypto.randomUUID(), organizationId: "org-1" },
      now: NOW,
      history: {
        id: crypto.randomUUID(),
        entry: {
          kind: "admin_invited",
          at: NOW,
          moderatorId: operator as never,
          email: "admin@example.org",
        },
      },
    });
    if (invited.kind !== "invited") throw new Error("unreachable");
    await db.insert(authMember).values({
      id: "m1",
      organizationId: "org-1",
      userId: invited.userId,
      role: "admin",
      createdAt: NOW,
    });
    const d = deps(true);
    expect(await runAdmin("grant", ["admin@example.org"], d)).toBe(1);
    expect(d.lines.at(-1)).toMatch(/administers a shelter/);
    expect(await grants()).toEqual([]);
  });

  /** Finding 3: granting an invitee would make them both once they accept. */
  it("refuses an address with a live invitation to administer a shelter", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const operator = await user("op@example.org");
    await kabinetInvitationRepo(db).invite({
      shelterId: shelter.id,
      email: "invitee@example.org",
      name: "Олена",
      inviterUserId: operator,
      ids: {
        invitationId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        organizationId: crypto.randomUUID(),
      },
      now: NOW,
      history: {
        id: crypto.randomUUID(),
        entry: {
          kind: "admin_invited",
          at: NOW,
          moderatorId: operator as never,
          email: "invitee@example.org",
        },
      },
    });
    const d = deps(true);
    expect(await runAdmin("grant", ["invitee@example.org"], d)).toBe(1);
    expect(d.lines.at(-1)).toMatch(/live invitation/);
    expect(await grants()).toEqual([]);
  });

  it("revokes by stamping, keeps the row, and a later grant starts a new one", async () => {
    const id = await user("olena@example.org");
    await runAdmin("grant", ["olena@example.org"], deps(true));
    const later = new Date(NOW.getTime() + 1000);
    expect(await runAdmin("revoke", ["olena@example.org"], deps(true, later))).toBe(0);
    expect(await grants()).toEqual([expect.objectContaining({ userId: id, revokedAt: later })]);
    expect(await kabinetActorRepo(db).roleOf(id)).toEqual({ kind: "no_role" });
    expect(await runAdmin("revoke", ["olena@example.org"], deps(true))).toBe(1);
    expect(await runAdmin("grant", ["olena@example.org"], deps(true))).toBe(0);
    expect(await grants()).toHaveLength(2);
  });

  it("writes nothing on a declined grant or revoke", async () => {
    await user("olena@example.org");
    expect(await runAdmin("grant", ["olena@example.org"], deps(false))).toBe(1);
    expect(await grants()).toEqual([]);
    await runAdmin("grant", ["olena@example.org"], deps(true));
    expect(await runAdmin("revoke", ["olena@example.org"], deps(false))).toBe(1);
    expect((await grants())[0]?.revokedAt).toBeNull();
  });
});

describe("admin:sweep-invites (RS-Q1)", () => {
  async function deadInvite(email: string) {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    const operator = await user(`op-${email}`);
    await kabinetInvitationRepo(db).invite({
      shelterId: shelter.id,
      email,
      name: "Олена",
      inviterUserId: operator,
      ids: {
        invitationId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        organizationId: crypto.randomUUID(),
      },
      now: NOW,
      history: {
        id: crypto.randomUUID(),
        entry: { kind: "admin_invited", at: NOW, moderatorId: operator as never, email: email },
      },
    });
  }
  const expired = new Date(NOW.getTime() + INVITATION_TTL_MS + 1);

  it("lists on a dry run and deletes nothing", async () => {
    await deadInvite("olena@example.org");
    const d = deps(true, expired);
    expect(await runAdmin("sweep-invites", [], d)).toBe(0);
    expect(d.lines).toContain("  olena@example.org");
    expect(d.asked).toEqual([]);
    expect(await userByEmail("olena@example.org")).toBeDefined();
  });

  it("deletes with --apply after a yes, and not after a no", async () => {
    await deadInvite("olena@example.org");
    expect(await runAdmin("sweep-invites", ["--apply"], deps(false, expired))).toBe(1);
    expect(await userByEmail("olena@example.org")).toBeDefined();
    const d = deps(true, expired);
    expect(await runAdmin("sweep-invites", ["--apply"], d)).toBe(0);
    expect(d.lines.at(-1)).toBe("Deleted 1.");
    expect(await userByEmail("olena@example.org")).toBeUndefined();
  });

  /** Finding 7: the dry run lists exactly who --apply deletes, never an operator. */
  it("does not list an invitee who has since become an operator", async () => {
    await deadInvite("olena@example.org");
    const invitee = await userByEmail("olena@example.org");
    await db
      .insert(superAdmins)
      .values({ id: crypto.randomUUID(), userId: invitee?.id ?? "", grantedAt: NOW });
    const d = deps(true, expired);
    expect(await runAdmin("sweep-invites", [], d)).toBe(0);
    expect(d.lines[0]).toBe("0 invited user(s) the clean-up would delete:");
  });

  it("touches no live invitation", async () => {
    await deadInvite("olena@example.org");
    const d = deps(true, NOW);
    expect(await runAdmin("sweep-invites", ["--apply"], d)).toBe(0);
    expect(d.lines[0]).toBe("0 invited user(s) the clean-up would delete:");
    expect(await userByEmail("olena@example.org")).toBeDefined();
  });
});
