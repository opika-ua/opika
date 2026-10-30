import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_MAINTENANCE_LIMITS,
  disposeTestDatabaseAfterRun,
  dropTestDatabase,
  ensureTestDatabase,
  LOCAL_TEST_SERVER,
  TEST_DB_MAINTENANCE_LOCK_KEY,
} from "../src/test-utils/test-database";
import { dropListedDatabase } from "../src/tools/prune-test-dbs";

/**
 * The 2026-10-30 pile-up: concurrent DROP DATABASE statements waited forever
 * on ProcSignalBarrier. These run against the local server with scratch
 * databases (random derived names, so they never collide with a checkout's).
 */

const MAINTENANCE = `${LOCAL_TEST_SERVER}/postgres`;
const scratchName = () => `opika_test_${randomBytes(4).toString("hex")}`;
const urlOf = (name: string) => `${LOCAL_TEST_SERVER}/${name}`;
const created: string[] = [];

const admin = postgres(MAINTENANCE, { max: 1, onnotice: () => {} });
const exists = async (name: string) =>
  (await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`).length === 1;

async function scratch(): Promise<string> {
  const name = scratchName();
  created.push(name);
  await ensureTestDatabase(urlOf(name));
  return name;
}

afterAll(async () => {
  for (const name of created) await dropTestDatabase(urlOf(name), "force").catch(() => {});
  await admin.end({ timeout: 5 });
});

describe("parallel teardowns", () => {
  it("four teardowns of databases with open connections (one idle in a transaction) all finish", async () => {
    const names = await Promise.all([scratch(), scratch(), scratch(), scratch()]);
    const clients = names.map((name) => postgres(urlOf(name), { max: 1, onnotice: () => {} }));
    const started = Date.now();
    try {
      for (const client of clients) await client`SELECT 1`;
      // An idle-in-transaction session, the kind that pinned the old drops.
      const stuck = await clients[3]?.reserve();
      await stuck?.unsafe("BEGIN");
      await stuck?.unsafe("SELECT 1");

      const lines: string[] = [];
      const outcomes = await Promise.all(
        names.map((name) =>
          disposeTestDatabaseAfterRun(urlOf(name), "passed", {}, (l) => lines.push(l)),
        ),
      );
      expect(outcomes).toHaveLength(4);
      // Each database is still held open, so each is kept and says so; the point is that none hangs.
      for (const name of names) expect(lines.join("\n")).toContain(name);
      expect(Date.now() - started).toBeLessThan(60_000);
    } finally {
      await Promise.all(clients.map((client) => client.end({ timeout: 1 }).catch(() => {})));
    }
    // Once the connections are gone, the same teardowns drop them all.
    const after = await Promise.all(
      names.map((name) => disposeTestDatabaseAfterRun(urlOf(name), "passed", {}, () => {})),
    );
    expect(after.every((d) => d.kind === "drop")).toBe(true);
    for (const name of names) expect(await exists(name)).toBe(false);
  }, 90_000);
});

describe("maintenance lock", () => {
  const short = { ...DEFAULT_MAINTENANCE_LIMITS, lockWaitMs: 400, lockPollMs: 50 };

  it("serialises drops: a second drop blocks while the lock is held, and runs once it is released", async () => {
    const name = await scratch();
    const holder = postgres(MAINTENANCE, { max: 1, onnotice: () => {} });
    await holder.unsafe(`SELECT pg_advisory_lock(${TEST_DB_MAINTENANCE_LOCK_KEY})`);
    let released = false;
    try {
      const second = dropTestDatabase(urlOf(name), "force", { ...short, lockWaitMs: 5_000 });
      await new Promise((done) => setTimeout(done, 600));
      // Still blocked: the database is there while the holder has the lock.
      expect(await exists(name)).toBe(true);
      await holder.unsafe(`SELECT pg_advisory_unlock(${TEST_DB_MAINTENANCE_LOCK_KEY})`);
      released = true;
      expect(await second).toEqual({ kind: "dropped" });
      expect(await exists(name)).toBe(false);
    } finally {
      if (!released) await holder.unsafe(`SELECT pg_advisory_unlock_all()`);
      await holder.end({ timeout: 1 });
    }
  });

  it("gives up after the bound with a skipped value, leaving the database alone", async () => {
    const name = await scratch();
    const holder = postgres(MAINTENANCE, { max: 1, onnotice: () => {} });
    await holder.unsafe(`SELECT pg_advisory_lock(${TEST_DB_MAINTENANCE_LOCK_KEY})`);
    try {
      const started = Date.now();
      expect(await dropTestDatabase(urlOf(name), "force", short)).toEqual({
        kind: "skipped",
        reason: "lock_busy",
      });
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(await exists(name)).toBe(true);
      // The teardown turns that into a log line naming the database, and carries on.
      const lines: string[] = [];
      const disposal = await disposeTestDatabaseAfterRun(
        urlOf(name),
        "passed",
        {},
        (l) => lines.push(l),
        (target) => dropTestDatabase(target, "unless_in_use", short),
      );
      expect(disposal).toEqual({ kind: "keep", reason: "drop_not_completed" });
      expect(lines.join("\n")).toContain(name);
    } finally {
      await holder.end({ timeout: 1 });
    }
  });

  it("the lock is released after a drop, so the next one is not blocked", async () => {
    const name = await scratch();
    await dropTestDatabase(urlOf(name), "force", short);
    const probe = postgres(MAINTENANCE, { max: 1, onnotice: () => {} });
    try {
      const [row] = await probe.unsafe(
        `SELECT pg_try_advisory_lock(${TEST_DB_MAINTENANCE_LOCK_KEY}) AS locked`,
      );
      expect(row?.locked).toBe(true);
    } finally {
      await probe.end({ timeout: 1 });
    }
  });
});

describe("statement timeout", () => {
  it("a drop that outlives statement_timeout throws 57014 and the teardown logs its name and continues", async () => {
    const name = await scratch();
    // A 1 ms statement_timeout: any real DROP exceeds it, standing in for the stuck barrier wait.
    const tiny = { ...DEFAULT_MAINTENANCE_LIMITS, statementTimeoutMs: 1 };
    const lines: string[] = [];
    const disposal = await disposeTestDatabaseAfterRun(
      urlOf(name),
      "passed",
      {},
      (l) => lines.push(l),
      (target) => dropTestDatabase(target, "unless_in_use", tiny),
    );
    expect(disposal).toEqual({ kind: "keep", reason: "drop_not_completed" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(name);
    expect(lines[0]).toContain("57014");
  });
});

describe("db:prune-test-dbs --yes on the real server", () => {
  it("drops a forced scratch database that still has an open connection", async () => {
    const name = await scratch();
    const open = postgres(urlOf(name), { max: 1, onnotice: () => {} });
    try {
      await open`SELECT 1`;
      await dropListedDatabase(MAINTENANCE, name);
      expect(await exists(name)).toBe(false);
    } finally {
      await open.end({ timeout: 1 }).catch(() => {});
    }
  });
});
