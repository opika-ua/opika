import { mkdtempSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_ROOT,
  checkoutComment,
  disposalAfterRun,
  disposeTestDatabaseAfterRun,
  dropTestDatabase,
  ensureTestDatabase,
  KEEP_ON_FAILURE_ENV,
  parseCheckoutComment,
  testDatabaseName,
  testDatabaseUrl,
} from "../src/test-utils/test-database";
import { runOutcome } from "../src/test-utils/vitest-global-setup";
import {
  classifyDatabase,
  dropListedDatabase,
  type ListedDatabase,
  listTestDatabases,
  localPruneEnvironment,
  mayDrop,
  type PathStatus,
  type PruneEnvironment,
  pruneTestDatabases,
} from "../src/tools/prune-test-dbs";

/**
 * Test-database clean-up (agreed with Oleksii 2026-10-13, relayed): each
 * run drops its database unless it failed with KEEP_TEST_DB_ON_FAILURE=1,
 * and `db:prune-test-dbs` drops only a database whose recorded checkout is
 * provably gone: never a remote server's, never this checkout's, never the
 * dev database, never one of unknown origin, and nothing at all without --yes.
 */

const HOST = "this-machine";
const CURRENT = "D:\\Startup\\opika";
const GONE = "D:\\opika-worktrees\\old-review";
const LIVE = "D:\\opika-worktrees\\live-review";

/** A Windows-shaped environment; every check here is pure, so it runs the same on Linux CI. */
const env = (overrides: Partial<PruneEnvironment> = {}): PruneEnvironment => ({
  currentNames: new Set([testDatabaseName("test", CURRENT), testDatabaseName("harness", CURRENT)]),
  currentCheckout: [CURRENT],
  hostname: HOST,
  windows: true,
  status: (path): PathStatus => (path === GONE ? "missing" : "exists"),
  spellings: (path) => [path],
  ...overrides,
});

/**
 * The comment as `checkoutComment` writes it, minus its `resolve`: these
 * fixtures are Windows paths, and on a Linux host `resolve` would prefix the
 * working directory. The real writer is exercised against the server below.
 */
const comment = (checkout: string, host = HOST) => JSON.stringify({ checkout, host });

const recorded = (kind: "test" | "harness", checkout: string, host = HOST): ListedDatabase => ({
  name: testDatabaseName(kind, checkout),
  comment: comment(checkout, host),
});

describe("classifyDatabase", () => {
  it("drops a database only when its recorded checkout is gone", () => {
    expect(classifyDatabase(recorded("test", GONE), env())).toEqual({
      kind: "gone",
      checkout: GONE,
    });
    expect(classifyDatabase(recorded("harness", LIVE), env())).toEqual({
      kind: "live",
      checkout: LIVE,
    });
  });

  it("never selects the dev database, whatever its comment says", () => {
    expect(classifyDatabase({ name: "opika", comment: comment(GONE) }, env())).toEqual({
      kind: "dev_database",
    });
  });

  it("never selects this checkout's own databases, even with every path reported missing", () => {
    const allMissing = env({ status: () => "missing" });
    expect(classifyDatabase(recorded("test", CURRENT), allMissing)).toEqual({
      kind: "current_checkout",
    });
    expect(classifyDatabase(recorded("harness", CURRENT), allMissing)).toEqual({
      kind: "current_checkout",
    });
  });

  it("never selects a TEST_DATABASE_URL override's database, even if its recorded checkout is gone", () => {
    const db = recorded("test", GONE);
    const overridden = env({ currentNames: new Set([db.name]) });
    expect(classifyDatabase(db, overridden)).toEqual({ kind: "current_checkout" });
  });

  it("recognises this checkout under another spelling of its path (8.3 short name, case, slashes)", () => {
    const short = "D:\\STARTU~1\\opika";
    // The name was hashed from the short spelling, so only the path comparison can catch it.
    const db = recorded("test", short);
    const current = env({
      status: (path) => (path === short ? "missing" : "exists"),
      spellings: (path) => (path === short ? [short, "d:/startup/OPIKA/"] : [path]),
    });
    expect(classifyDatabase(db, current)).toEqual({ kind: "current_checkout" });
  });

  it.each([
    ["no comment (made before comments existed)", { comment: null }, "no_comment"],
    [
      "a comment that isn't a recorded checkout",
      { comment: "hand-written note" },
      "unreadable_comment",
    ],
    [
      "a comment naming a checkout that doesn't hash to this name",
      { comment: comment(LIVE) },
      "comment_does_not_match_name",
    ],
  ] as const)(
    "never drops a database with %s, even when its checkout is gone",
    (_what, patch, why) => {
      const db = { ...recorded("test", GONE), ...patch };
      expect(classifyDatabase(db, env())).toEqual({ kind: "unknown_origin", why });
    },
  );

  it("never drops a name outside the derived pattern (the legacy shared opika_test)", () => {
    expect(classifyDatabase({ name: "opika_test", comment: comment(GONE) }, env())).toEqual({
      kind: "unknown_origin",
      why: "not_a_derived_name",
    });
  });

  it("leaves another machine's databases alone, and a path shaped for the other OS (WSL)", () => {
    expect(classifyDatabase(recorded("test", GONE, "other-machine"), env())).toMatchObject({
      kind: "other_machine",
    });
    const posixPath = "/home/dev/opika";
    expect(
      classifyDatabase(recorded("test", posixPath), env({ status: () => "missing" })),
    ).toMatchObject({ kind: "other_machine" });
  });

  it("doesn't read a missing drive or an unreadable path as a deleted checkout", () => {
    expect(classifyDatabase(recorded("test", GONE), env({ status: () => "missing" }))).toEqual({
      kind: "unverifiable",
      checkout: GONE,
      why: "root_missing",
    });
    expect(
      classifyDatabase(
        recorded("test", GONE),
        env({ status: (p) => (p === GONE ? "unknown" : "exists") }),
      ),
    ).toEqual({ kind: "unverifiable", checkout: GONE, why: "status_unknown" });
  });
});

describe("mayDrop", () => {
  const gone = { kind: "gone", checkout: GONE } as const;

  it("refuses the dev database, this checkout's own and an underived name, even marked gone", () => {
    for (const name of [
      "opika",
      testDatabaseName("test", CURRENT),
      testDatabaseName("harness", CURRENT),
      "opika_test",
      "postgres",
    ]) {
      expect(mayDrop({ name, verdict: gone }, env())).toBe(false);
    }
  });

  it("allows a derived name marked gone, and nothing marked anything else", () => {
    const name = testDatabaseName("test", GONE);
    expect(mayDrop({ name, verdict: gone }, env())).toBe(true);
    expect(mayDrop({ name, verdict: { kind: "live", checkout: GONE } }, env())).toBe(false);
    expect(mayDrop({ name, verdict: { kind: "unknown_origin", why: "no_comment" } }, env())).toBe(
      false,
    );
  });
});

describe("pruneTestDatabases", () => {
  const listing: ListedDatabase[] = [
    recorded("test", GONE),
    recorded("harness", GONE),
    recorded("test", LIVE),
    recorded("test", CURRENT),
    { ...recorded("harness", "D:\\another\\gone"), comment: null },
    { name: "opika_test", comment: null },
  ];
  const run = async (yes: boolean, serverUrl = "postgres://opika:opika@localhost:5433") => {
    const lines: string[] = [];
    const list = vi.fn(async () => listing);
    const drop = vi.fn(async (_server: string, _name: string) => {});
    const code = await pruneTestDatabases({
      serverUrl,
      yes,
      env: env({ status: (p) => (p === GONE || p === "D:\\another\\gone" ? "missing" : "exists") }),
      list,
      drop,
      log: (line) => lines.push(line),
    });
    return { code, lines, list, drop };
  };

  it.each([
    ["a Neon host", "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech/neondb"],
    ["any other remote host", "postgres://u:secret@db.example.com:5432/postgres"],
    [
      "a local URL whose query string redirects the host",
      "postgres://u:secret@localhost:5433/x?host=db.example.com",
    ],
    ["an unparseable URL", "not a url secret"],
  ])("refuses %s before connecting, without printing the URL", async (_what, url) => {
    const { code, lines, list, drop } = await run(true, url);
    expect(code).toBe(1);
    expect(list).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    expect(lines.join("\n")).toMatch(/only works on a local server/);
    expect(lines.join("\n")).not.toContain("secret");
  });

  /** The guard's ambient rule (PG-T10, 2026-10-19): the message names the variable, never its value. */
  it("refuses with PGPORT set, naming it, before connecting", async () => {
    vi.stubEnv("PGPORT", "6543-secret");
    try {
      const { code, lines, list, drop } = await run(true);
      expect(code).toBe(1);
      expect(list).not.toHaveBeenCalled();
      expect(drop).not.toHaveBeenCalled();
      expect(lines).toEqual([
        "ERROR: db:prune-test-dbs refuses: set in the environment: PGPORT. A driver reads it alongside DATABASE_URL, the only connection setting the guard checks. Unset it and put everything in DATABASE_URL. Refusing.",
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("dry run (no --yes) lists everything and drops nothing", async () => {
    const { code, lines, drop } = await run(false);
    expect(code).toBe(0);
    expect(drop).not.toHaveBeenCalled();
    const out = lines.join("\n");
    for (const db of listing) expect(out).toContain(db.name);
    expect(out).toContain("Dry run: 2 would be dropped. Re-run with --yes to drop them.");
  });

  it("--yes drops the gone checkout's two databases and nothing else", async () => {
    const { code, drop } = await run(true);
    expect(code).toBe(0);
    expect(drop.mock.calls.map(([, name]) => name).sort()).toEqual(
      [testDatabaseName("harness", GONE), testDatabaseName("test", GONE)].sort(),
    );
  });
});

describe("disposalAfterRun", () => {
  it.each([
    ["passed", {}, "drop"],
    ["passed", { [KEEP_ON_FAILURE_ENV]: "1" }, "drop"],
    ["failed", {}, "drop"],
    ["failed", { [KEEP_ON_FAILURE_ENV]: "0" }, "drop"],
    ["failed", { [KEEP_ON_FAILURE_ENV]: "1" }, "keep"],
    ["interrupted", { [KEEP_ON_FAILURE_ENV]: "1" }, "keep"],
    ["timedout", { [KEEP_ON_FAILURE_ENV]: "1" }, "keep"],
  ] as const)("a %s run with %o: %s", (outcome, flags, kind) => {
    expect(disposalAfterRun(outcome, flags).kind).toBe(kind);
  });
});

describe("runOutcome (the vitest teardown's reading of the run)", () => {
  const run = (states: string[], unhandled: unknown[] = []) =>
    runOutcome({
      vitest: {
        state: {
          getUnhandledErrors: () => unhandled,
          getTestModules: () => states.map((s) => ({ state: () => s })),
        },
      },
    } as unknown as Parameters<typeof runOutcome>[0]);

  it("passes only when every module passed or was skipped and nothing errored outside a test", () => {
    expect(run(["passed", "skipped"])).toBe("passed");
    expect(run(["passed", "failed"])).toBe("failed");
    expect(run(["passed"], [new Error("unhandled")])).toBe("failed");
    expect(run(["passed", "queued"])).toBe("interrupted");
    expect(run(["pending"])).toBe("interrupted");
  });
});

describe("disposeTestDatabaseAfterRun", () => {
  const url = testDatabaseUrl("test", "D:/anywhere");

  it("keeps a failed run's database only with the flag, and says which one", async () => {
    const drop = vi.fn(async () => ({ kind: "dropped" }) as const);
    const lines: string[] = [];
    const flagged = { [KEEP_ON_FAILURE_ENV]: "1" };
    await disposeTestDatabaseAfterRun(url, "failed", flagged, (l) => lines.push(l), drop);
    expect(drop).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain(testDatabaseName("test", "D:/anywhere"));
    expect(lines.join("\n")).not.toContain("opika:opika");

    await disposeTestDatabaseAfterRun(url, "failed", {}, () => {}, drop);
    expect(drop).toHaveBeenCalledWith(url);
  });

  it("says, rather than throws, when the server isn't running; rethrows anything else", async () => {
    const refused = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
    const lines: string[] = [];
    await disposeTestDatabaseAfterRun(
      url,
      "passed",
      {},
      (l) => lines.push(l),
      async () => {
        throw refused;
      },
    );
    expect(lines.join("\n")).toMatch(/not reachable/);
    await expect(
      disposeTestDatabaseAfterRun(
        url,
        "passed",
        {},
        () => {},
        async () => {
          throw new Error("permission denied");
        },
      ),
    ).rejects.toThrow("permission denied");
  });

  it("keeps a database another session is using, and says so in one line", async () => {
    const lines: string[] = [];
    const disposal = await disposeTestDatabaseAfterRun(
      url,
      "passed",
      {},
      (l) => lines.push(l),
      async () => ({ kind: "in_use" }),
    );
    expect(disposal).toEqual({ kind: "keep", reason: "in_use_by_another_session" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(testDatabaseName("test", "D:/anywhere"));
    expect(lines[0]).toMatch(/another session/);
  });

  it("refuses the dev database", async () => {
    await expect(
      disposeTestDatabaseAfterRun("postgres://opika:opika@localhost:5433/opika", "passed", {}),
    ).rejects.toThrow(/Refusing/);
  });
});

describe("parseCheckoutComment", () => {
  it("reads back what checkoutComment wrote, and nothing else", () => {
    const written = checkoutComment(join(tmpdir(), "some-checkout"), HOST);
    expect(parseCheckoutComment(written)).toEqual(JSON.parse(written));
    for (const other of [
      null,
      "",
      "{}",
      "[]",
      '"x"',
      '{"checkout":"","host":"h"}',
      '{"checkout":"/x"}',
    ]) {
      expect(parseCheckoutComment(other)).toBeNull();
    }
  });
});

describe("localPruneEnvironment", () => {
  it("counts this checkout's derived pair and a TEST_DATABASE_URL override as current", () => {
    const override = "postgres://opika:opika@localhost:5433/opika_test_0123abcd";
    const names = localPruneEnvironment({ TEST_DATABASE_URL: override }).currentNames;
    expect(names.has(testDatabaseName("test", CHECKOUT_ROOT))).toBe(true);
    expect(names.has(testDatabaseName("harness", CHECKOUT_ROOT))).toBe(true);
    expect(names.has("opika_test_0123abcd")).toBe(true);
    expect(names.size).toBe(3);
  });
});

/** Against the local server: the comment is really written, read back, and acted on. */
describe("on the local server", () => {
  const server = postgres("postgres://opika:opika@localhost:5433/postgres", { max: 1 });
  const scratch = mkdtempSync(join(tmpdir(), "opika-prune-test-"));
  const url = testDatabaseUrl("test", scratch);
  const name = testDatabaseName("test", scratch);
  const commentOf = async (db: string) =>
    (
      await server<{ comment: string | null }[]>`
        SELECT shobj_description(oid, 'pg_database') AS comment FROM pg_database WHERE datname = ${db}`
    )[0]?.comment;

  afterAll(async () => {
    await dropTestDatabase(url, "force");
    rmSync(scratch, { recursive: true, force: true });
    await server.end();
  });

  it("records the checkout at creation, lists it, and drops it once the checkout is deleted", async () => {
    await ensureTestDatabase(url, scratch);
    expect(parseCheckoutComment((await commentOf(name)) ?? null)).toEqual({
      checkout: JSON.parse(checkoutComment(scratch)).checkout,
      host: hostname(),
    });

    const listed = await listTestDatabases("postgres://opika:opika@localhost:5433/postgres");
    expect(listed.every((db) => /^opika_(test|harness)/.test(db.name))).toBe(true);
    const ours = listed.find((db) => db.name === name);
    expect(ours).toBeDefined();
    const localEnv = localPruneEnvironment({});
    expect(classifyDatabase(ours as ListedDatabase, localEnv).kind).toBe("live");

    rmSync(scratch, { recursive: true, force: true });
    expect(classifyDatabase(ours as ListedDatabase, localEnv).kind).toBe("gone");
    await dropListedDatabase("postgres://opika:opika@localhost:5433/postgres", name);
    expect(await commentOf(name)).toBeUndefined();
  });

  it("adds the comment to a database made before comments existed, and none to a name it didn't derive", async () => {
    const other = mkdtempSync(join(tmpdir(), "opika-prune-test-"));
    const otherUrl = testDatabaseUrl("harness", other);
    try {
      await server.unsafe(`CREATE DATABASE "${testDatabaseName("harness", other)}"`);
      expect(await commentOf(testDatabaseName("harness", other))).toBeNull();
      // Ensured from another checkout's path: not this name's origin, so no comment.
      await ensureTestDatabase(otherUrl, scratch);
      expect(await commentOf(testDatabaseName("harness", other))).toBeNull();
      await ensureTestDatabase(otherUrl, other);
      expect(
        parseCheckoutComment((await commentOf(testDatabaseName("harness", other))) ?? null),
      ).not.toBeNull();
    } finally {
      await dropTestDatabase(otherUrl, "force");
      rmSync(other, { recursive: true, force: true });
    }
  });
});
