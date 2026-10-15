import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  assertDisposableTestDatabase,
  disposeTestDatabaseAfterRun,
  dropTestDatabase,
  ensureTestDatabase,
  testDatabaseName,
  testDatabaseUrl,
} from "../src/test-utils/test-database";

/**
 * Test-database isolation (Oleksii, 2026-10-13): every checkout derives its
 * own database names from its absolute path, so two checkouts never share
 * one, and nothing derived can ever be the dev database or a remote one.
 */

describe("testDatabaseName", () => {
  it("gives two different checkout paths two different names", () => {
    const main = testDatabaseName("test", "D:/Startup/opika");
    const review = testDatabaseName("test", "D:/opika-worktrees/registry-review");
    expect(main).not.toBe(review);
    expect(main).toMatch(/^opika_test_[0-9a-f]{8}$/);
    expect(review).toMatch(/^opika_test_[0-9a-f]{8}$/);
  });

  it("is stable for one checkout, and separate for vitest and the harness", () => {
    expect(testDatabaseName("test", "D:/Startup/opika")).toBe(
      testDatabaseName("test", "D:/Startup/opika"),
    );
    expect(testDatabaseName("harness", "D:/Startup/opika")).not.toBe(
      testDatabaseName("test", "D:/Startup/opika"),
    );
  });
});

describe("assertDisposableTestDatabase", () => {
  it("accepts a derived local name", () => {
    const url = testDatabaseUrl("test", "D:/anywhere");
    expect(assertDisposableTestDatabase(url)).toBe(url);
  });

  it.each([
    ["the dev database", "postgres://opika:opika@localhost:5433/opika"],
    [
      "a derived name with ?database= overriding it",
      "postgres://opika:opika@localhost:5433/opika_test_0123abcd?database=opika",
    ],
    [
      "a derived name with a fragment",
      "postgres://opika:opika@localhost:5433/opika_test_0123abcd#x",
    ],
    ["the old shared name", "postgres://opika:opika@localhost:5433/opika_test"],
    ["any other local database", "postgres://opika:opika@localhost:5433/postgres"],
    [
      "a Neon host, even with a derived name",
      "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech/opika_test_0123abcd",
    ],
  ])("refuses %s, without echoing the URL", (_what, url) => {
    let message = "";
    try {
      assertDisposableTestDatabase(url);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/Refusing/);
    expect(message).not.toContain("secret");
  });
});

describe("ensureTestDatabase / dropTestDatabase", () => {
  const url = testDatabaseUrl("harness", `isolation-test-${process.pid}`);
  const name = new URL(url).pathname.slice(1);
  const server = postgres("postgres://opika:opika@localhost:5433/postgres", { max: 1 });
  const exists = async () =>
    (await server`SELECT 1 FROM pg_database WHERE datname = ${name}`).length === 1;

  afterAll(async () => {
    await dropTestDatabase(url, "force");
    await server.end();
  });

  it("creates the database once, tolerates a second ensure, and a forced drop closes an open connection", async () => {
    await ensureTestDatabase(url);
    await ensureTestDatabase(url);
    expect(await exists()).toBe(true);
    const open = postgres(url, { max: 1 });
    await open`SELECT 1`;
    expect(await dropTestDatabase(url, "force")).toEqual({ kind: "dropped" });
    expect(await exists()).toBe(false);
    await open.end({ timeout: 0 }).catch(() => {});
  });

  // The after-run teardown's mode. A second run in the same checkout holding
  // the database open must keep it, or that run's tests fail mid-run.
  it("keeps a database another session holds open when not forced, and drops it once none does", async () => {
    await ensureTestDatabase(url);
    const open = postgres(url, { max: 1 });
    try {
      await open`SELECT 1`;
      expect(await dropTestDatabase(url, "unless_in_use")).toEqual({ kind: "in_use" });
      expect(await exists()).toBe(true);
      await open`SELECT 1`;
    } finally {
      await open.end();
    }
    expect(await dropTestDatabase(url, "unless_in_use")).toEqual({ kind: "dropped" });
    expect(await exists()).toBe(false);
    expect(await dropTestDatabase(url, "unless_in_use")).toEqual({ kind: "dropped" });
  });

  it("the after-run teardown, as both runners call it, keeps a database in use and drops an idle one", async () => {
    await ensureTestDatabase(url);
    const lines: string[] = [];
    const open = postgres(url, { max: 1 });
    try {
      await open`SELECT 1`;
      expect(await disposeTestDatabaseAfterRun(url, "passed", {}, (l) => lines.push(l))).toEqual({
        kind: "keep",
        reason: "in_use_by_another_session",
      });
      expect(await exists()).toBe(true);
    } finally {
      await open.end();
    }
    expect(lines).toEqual([`Kept test database ${name}: another session is still using it.`]);
    expect(await disposeTestDatabaseAfterRun(url, "passed", {}, () => {})).toEqual({
      kind: "drop",
    });
    expect(await exists()).toBe(false);
  });

  it("refuses to create or drop the dev database", async () => {
    await expect(ensureTestDatabase("postgres://opika:opika@localhost:5433/opika")).rejects.toThrow(
      /Refusing/,
    );
    await expect(
      dropTestDatabase("postgres://opika:opika@localhost:5433/opika", "force"),
    ).rejects.toThrow(/Refusing/);
  });
});
