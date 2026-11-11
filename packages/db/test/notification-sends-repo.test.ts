import { randomUUID } from "node:crypto";
import type { ShelterId } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { MAX_SEND_ATTEMPTS, notificationSendsRepo } from "../src/repos/notification-sends-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authUser } from "../src/schema/auth";
import { notificationSends } from "../src/schema/notification-sends";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";

/** Real Postgres: the claim race and the purge cutoff are properties of the SQL, not of a mock. */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-11-10T06:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

async function user(): Promise<string> {
  const id = randomUUID();
  await db.insert(authUser).values({
    id,
    name: "Адмін",
    email: `${id}@example.org`,
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

async function shelter(): Promise<ShelterId> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  const row = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(row);
  return row.id;
}

/** A row written directly, so a test can set `createdAt` and `attempts` the app never would. */
async function seed(
  dedupKey: string,
  over: Partial<typeof notificationSends.$inferInsert> = {},
): Promise<void> {
  await db.insert(notificationSends).values({
    dedupKey,
    kind: "approved",
    status: "failed",
    attempts: 1,
    createdAt: ago(HOUR),
    updatedAt: ago(HOUR),
    ...over,
  });
}

const rowOf = async (dedupKey: string) =>
  (await db.select().from(notificationSends).where(eq(notificationSends.dedupKey, dedupKey)))[0];

describe("claim", () => {
  it("creates a claimed row with one attempt for the first caller only", async () => {
    const repo = notificationSendsRepo(db);
    const recipientUserId = await user();
    const shelterId = await shelter();
    const claim = { dedupKey: "h:1:u", kind: "approved", shelterId, recipientUserId };

    expect(await repo.claim(NOW, claim)).toBe(true);
    expect(await repo.claim(new Date(NOW.getTime() + HOUR), claim)).toBe(false);

    expect(await rowOf("h:1:u")).toMatchObject({
      kind: "approved",
      shelterId,
      recipientUserId,
      status: "claimed",
      attempts: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("lets exactly one of many concurrent claims of one key win", async () => {
    const repo = notificationSendsRepo(db);
    const claim = {
      dedupKey: "fr:s:2026-W46:u",
      kind: "freshnessReminder",
      shelterId: null,
      recipientUserId: null,
    };

    const outcomes = await Promise.all(Array.from({ length: 8 }, () => repo.claim(NOW, claim)));

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(notificationSends)).toHaveLength(1);
  });

  it("keeps different keys independent", async () => {
    const repo = notificationSendsRepo(db);
    const base = { kind: "approved", shelterId: null, recipientUserId: null };
    expect(await repo.claim(NOW, { ...base, dedupKey: "a" })).toBe(true);
    expect(await repo.claim(NOW, { ...base, dedupKey: "b" })).toBe(true);
  });
});

describe("mark", () => {
  it("moves a claimed row to sent or failed and stamps updated_at", async () => {
    const repo = notificationSendsRepo(db);
    const base = { kind: "approved", shelterId: null, recipientUserId: null };
    await repo.claim(NOW, { ...base, dedupKey: "ok" });
    await repo.claim(NOW, { ...base, dedupKey: "bad" });
    const later = new Date(NOW.getTime() + 5_000);

    expect(await repo.mark(later, "ok", "sent")).toBe(true);
    expect(await repo.mark(later, "bad", "failed")).toBe(true);

    expect(await rowOf("ok")).toMatchObject({ status: "sent", updatedAt: later, createdAt: NOW });
    expect(await rowOf("bad")).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("never moves a row that is not claimed, and says so", async () => {
    await seed("done", { status: "sent" });
    expect(await notificationSendsRepo(db).mark(NOW, "done", "failed")).toBe(false);
    expect((await rowOf("done"))?.status).toBe("sent");
    expect(await notificationSendsRepo(db).mark(NOW, "missing", "sent")).toBe(false);
  });
});

describe("retryable and reclaim", () => {
  it("returns only failed rows inside 48 hours that still have an attempt left", async () => {
    await seed("fresh-failed");
    await seed("old-failed", { createdAt: ago(49 * HOUR) });
    await seed("spent", { attempts: 2 });
    await seed("sent", { status: "sent" });
    await seed("stuck-claimed", { status: "claimed" });

    const keys = (await notificationSendsRepo(db).retryable(NOW)).map((r) => r.dedupKey);

    expect(keys).toEqual(["fresh-failed"]);
  });

  it("includes a row exactly at the window edge and honours the parameters", async () => {
    await seed("edge", { createdAt: ago(48 * HOUR) });
    await seed("older", { attempts: 2, createdAt: ago(60 * HOUR) });
    const repo = notificationSendsRepo(db);

    expect((await repo.retryable(NOW)).map((r) => r.dedupKey)).toEqual(["edge"]);
    expect(
      (await repo.retryable(NOW, { sinceHours: 72, maxAttempts: 3 })).map((r) => r.dedupKey),
    ).toEqual(["older", "edge"]);
  });

  it("reclaim counts the attempt, hands the row to one caller, and stops at the cap", async () => {
    await seed("r");
    const repo = notificationSendsRepo(db);

    const outcomes = await Promise.all([repo.reclaim(NOW, "r"), repo.reclaim(NOW, "r")]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await rowOf("r")).toMatchObject({ status: "claimed", attempts: 2, updatedAt: NOW });

    await repo.mark(NOW, "r", "failed");
    expect(await repo.reclaim(NOW, "r")).toBe(false);
    expect((await rowOf("r"))?.attempts).toBe(2);
  });

  it("reclaim refuses a sent row and a claimed row, and changes neither", async () => {
    await seed("done", { status: "sent" });
    await seed("in-flight", { status: "claimed" });
    const repo = notificationSendsRepo(db);

    expect(await repo.reclaim(NOW, "done")).toBe(false);
    expect(await repo.reclaim(NOW, "in-flight")).toBe(false);
    expect(await repo.reclaim(NOW, "missing")).toBe(false);

    expect(await rowOf("done")).toMatchObject({ status: "sent", attempts: 1 });
    expect(await rowOf("in-flight")).toMatchObject({ status: "claimed", attempts: 1 });
  });
});

describe("purgeOlderThan", () => {
  it("deletes rows strictly older than 90 days, whatever their status, and keeps the rest", async () => {
    await seed("old-sent", { status: "sent", createdAt: ago(90 * DAY + 1) });
    await seed("old-failed", { createdAt: ago(120 * DAY) });
    await seed("exactly-90", { status: "sent", createdAt: ago(90 * DAY) });
    await seed("recent", { status: "sent", createdAt: ago(89 * DAY) });

    expect(await notificationSendsRepo(db).purgeOlderThan(NOW)).toBe(2);

    const left = (await db.select().from(notificationSends)).map((r) => r.dedupKey).sort();
    expect(left).toEqual(["exactly-90", "recent"]);
  });

  it("takes the retention in days as a parameter and returns 0 when nothing qualifies", async () => {
    await seed("a", { createdAt: ago(10 * DAY) });
    const repo = notificationSendsRepo(db);
    expect(await repo.purgeOlderThan(NOW)).toBe(0);
    expect(await repo.purgeOlderThan(NOW, 7)).toBe(1);
  });
});

describe("closeFailed", () => {
  it("fails a claimed row with every attempt spent, so retryable never offers it", async () => {
    await seed("c", { status: "claimed", attempts: 1 });
    const repo = notificationSendsRepo(db);
    expect(await repo.closeFailed(NOW, "c")).toBe(true);
    expect(await rowOf("c")).toMatchObject({ status: "failed", attempts: MAX_SEND_ATTEMPTS });
    expect(await repo.retryable(NOW)).toEqual([]);
    expect(await repo.reclaim(NOW, "c")).toBe(false);
  });

  it("keeps a higher attempt count, and leaves a sent, a failed or a missing row alone", async () => {
    await seed("sent", { status: "sent" });
    await seed("failed", { status: "failed", attempts: 1 });
    await seed("third", { status: "claimed", attempts: 5 });
    const repo = notificationSendsRepo(db);
    expect(await repo.closeFailed(NOW, "sent")).toBe(false);
    expect(await repo.closeFailed(NOW, "failed")).toBe(false);
    expect(await repo.closeFailed(NOW, "missing")).toBe(false);
    expect(await repo.closeFailed(NOW, "third")).toBe(true);
    expect((await rowOf("third"))?.attempts).toBe(5);
    expect(await rowOf("sent")).toMatchObject({ status: "sent" });
    expect(await rowOf("failed")).toMatchObject({ status: "failed", attempts: 1 });
  });
});

describe("countCreatedSince", () => {
  it("counts rows of the given kinds created at or after the instant, whatever their status", async () => {
    const since = ago(2 * HOUR);
    await seed("on-the-instant", { createdAt: since, status: "sent" });
    await seed("after", { createdAt: ago(HOUR), status: "failed" });
    await seed("before", { createdAt: ago(2 * HOUR + 1) });
    await seed("other-kind", { createdAt: ago(HOUR), kind: "freshnessReminder" });
    const repo = notificationSendsRepo(db);
    expect(await repo.countCreatedSince(since, ["approved"])).toBe(2);
    expect(await repo.countCreatedSince(since, ["approved", "freshnessReminder"])).toBe(3);
    expect(await repo.countCreatedSince(since, [])).toBe(0);
    expect(await repo.countCreatedSince(NOW, ["approved"])).toBe(0);
  });
});

describe("references", () => {
  it("keeps the row, with the recipient cleared, when the user is deleted", async () => {
    const recipientUserId = await user();
    await seed("u", { recipientUserId });

    await db.delete(authUser).where(eq(authUser.id, recipientUserId));

    expect(await rowOf("u")).toMatchObject({ dedupKey: "u", recipientUserId: null });
  });

  it("keeps the row, with the shelter cleared, when the shelter is deleted", async () => {
    const shelterId = await shelter();
    await seed("s", { shelterId });

    await db.delete(shelters).where(eq(shelters.id, shelterId));

    expect(await rowOf("s")).toMatchObject({ dedupKey: "s", shelterId: null });
  });
});
