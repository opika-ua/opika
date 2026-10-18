import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseRevokeArgs } from "../src/auth-revoke-all";
import { adopterRepo } from "../src/repos/adopter-repo";
import { authRevokeRepo } from "../src/repos/auth-revoke-repo";
import { cityRepo } from "../src/repos/city-repo";
import { sessionRepo } from "../src/repos/session-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { adopters } from "../src/schema/adopters";
import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
  invitationCreatedUsers,
  superAdmins,
  supportSessions,
} from "../src/schema/auth";
import { cities } from "../src/schema/cities";
import { sessions } from "../src/schema/sessions";
import { shelters } from "../src/schema/shelters";
import {
  makeAdopter,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
  uuid,
} from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * `auth:revoke-all`, the required purge after rotating `BETTER_AUTH_SECRET`
 * (Oleksii, 2026-10-18, KH-Q12 rotation). Every fixture outside the two purged
 * tables is something a real database holds next to them; the assertions
 * check that the two tables empty and that each of those stays.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-18T21:00:00.000Z");
const LATER = new Date(NOW.getTime() + 86_400_000);

/** The tables the purge must leave alone, each holding at least one row after `fixtures()`. */
const UNTOUCHED: Record<string, PgTable> = {
  auth_user: authUser,
  auth_account: authAccount,
  auth_organization: authOrganization,
  auth_member: authMember,
  auth_invitation: authInvitation,
  invitation_created_users: invitationCreatedUsers,
  super_admins: superAdmins,
  support_sessions: supportSessions,
  shelters,
  cities,
  adopters,
  sessions,
};

const countsOf = async (tables: Record<string, PgTable>) => {
  const out: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    out[name] = (await db.select({ n: count() }).from(table))[0]?.n ?? 0;
  }
  return out;
};

const purged = async () =>
  countsOf({ auth_session: authSession, auth_verification: authVerification });

/**
 * A database as it stands after a rotation: the operator and a shelter admin,
 * each signed in (three sessions), two sign-in links in flight, and everything
 * a kabinet sign-in hangs off, plus an adopter's anonymous device session,
 * which is not a kabinet sign-in at all.
 */
async function fixtures() {
  const user = async (name: string) => {
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
  };
  const operator = await user("Оператор");
  const admin = await user("Адмін");
  await db.insert(superAdmins).values({ id: uuid(), userId: operator, grantedAt: NOW });
  await db.insert(authAccount).values({
    id: uuid(),
    accountId: admin,
    providerId: "email",
    userId: admin,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const city = makeCity();
  await cityRepo(db).insert(city);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  const organizationId = uuid();
  await db
    .insert(authOrganization)
    .values({ id: organizationId, name: organizationId, slug: organizationId, createdAt: NOW });
  await db
    .insert(authMember)
    .values({ id: uuid(), organizationId, userId: admin, role: "admin", createdAt: NOW });
  const invitationId = uuid();
  await db.insert(authInvitation).values({
    id: invitationId,
    organizationId,
    email: `${admin}@example.org`,
    role: "admin",
    status: "accepted",
    expiresAt: LATER,
    createdAt: NOW,
    inviterId: operator,
  });
  await db
    .insert(invitationCreatedUsers)
    .values({ userId: admin, invitationId, createdAt: NOW, firstSessionAt: NOW });
  await db.insert(supportSessions).values({
    id: uuid(),
    operatorUserId: operator,
    shelterId: shelter.id,
    tokenHash: uuid(),
    startedAt: NOW,
    lastSeenAt: NOW,
  });

  const signIn = (userId: string) => ({
    id: uuid(),
    token: uuid(),
    userId,
    expiresAt: LATER,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authSession).values([signIn(operator), signIn(admin), signIn(admin)]);
  const link = () => ({
    id: uuid(),
    identifier: uuid(),
    value: "{}",
    expiresAt: LATER,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(authVerification).values([link(), link()]);

  const adopter = makeAdopter();
  await adopterRepo(db).insert(adopter);
  await sessionRepo(db).insert({
    tokenHash: "a".repeat(64),
    adopterId: adopter.id,
    createdAt: NOW,
    lastSeenAt: NOW,
  });
}

describe("authRevokeRepo", () => {
  it("countAll reports both tables and deletes nothing", async () => {
    await fixtures();
    expect(await authRevokeRepo(db).countAll()).toEqual({ sessions: 3, verifications: 2 });
    expect(await purged()).toEqual({ auth_session: 3, auth_verification: 2 });
  });

  it("deleteAll empties both tables, returns what went, and leaves every other table as it was", async () => {
    await fixtures();
    const before = await countsOf(UNTOUCHED);
    // Each guarded table holds a row, so a delete reaching it would show.
    expect(Object.entries(before).filter(([, n]) => n === 0)).toEqual([]);
    expect(await authRevokeRepo(db).deleteAll()).toEqual({ sessions: 3, verifications: 2 });
    expect(await purged()).toEqual({ auth_session: 0, auth_verification: 0 });
    expect(await countsOf(UNTOUCHED)).toEqual(before);
  });

  it("deleteAll on empty tables deletes nothing and says so", async () => {
    expect(await authRevokeRepo(db).deleteAll()).toEqual({ sessions: 0, verifications: 0 });
  });
});

describe("parseRevokeArgs", () => {
  it("reads the runbook's three lines", () => {
    const dry = ["--prod", "--expect", "ep-dawn-pond-b1dz515g"];
    expect(parseRevokeArgs(dry)).toEqual({
      kind: "ok",
      expect: "ep-dawn-pond-b1dz515g",
      commit: false,
    });
    expect(parseRevokeArgs([...dry, "--commit"])).toEqual({
      kind: "ok",
      expect: "ep-dawn-pond-b1dz515g",
      commit: true,
    });
  });

  it("reads a local run: no --prod, no --expect", () => {
    expect(parseRevokeArgs([])).toEqual({ kind: "ok", expect: undefined, commit: false });
    expect(parseRevokeArgs(["--commit"])).toEqual({ kind: "ok", expect: undefined, commit: true });
  });

  it.each([
    [["--expect"], "--expect needs an endpoint id"],
    [["--expect", "--commit"], "--expect needs an endpoint id"],
    [["--expect", "ep-a-1", "--expect", "ep-b-2"], "--expect is given twice"],
    [["--expect=ep-a-1"], "write --expect <ep>, not --expect=<ep>"],
    [["--comit"], "--comit is not an argument this script takes"],
    [["--prod", "now"], "argument 2 is not one this script takes"],
  ])("refuses %j", (args, reason) => {
    const parsed = parseRevokeArgs(args);
    expect(parsed.kind).toBe("refused");
    expect(parsed.kind === "refused" ? parsed.reason : "").toContain(reason);
  });

  it("never echoes an argument that could be a pasted URL", () => {
    const parsed = parseRevokeArgs(["postgresql://u:secret@ep-x-1.eu-central-1.aws.neon.tech/db"]);
    expect(parsed).toEqual({
      kind: "refused",
      reason:
        "argument 1 is not one this script takes; it takes --prod, --expect <ep> and --commit",
    });
  });
});

/**
 * The real CLI, spawned. Against the local test database for what it does,
 * and against fake Neon URLs (nothing here resolves; `no-network.mjs` blocks
 * the one transport neon-http uses) for what it refuses.
 */
const SPAWN_TIMEOUT_MS = 60_000;
const SPAWN_TEST_TIMEOUT_MS = SPAWN_TIMEOUT_MS + 30_000;
const PKG = resolve(fileURLToPath(import.meta.url), "../..");
/** The developer's real .env.local must never decide a test's outcome. */
const NO_ENV_FILE = resolve(tmpdir(), "opika-auth-revoke-test-no-such-file.env");
const PROD_ENDPOINT = "ep-quiet-lake-a1b2c3";
const PROD_DIRECT = "postgresql://u:secret@ep-quiet-lake-a1b2c3.eu-central-1.aws.neon.tech/neondb";
const CHILD_BRANCH =
  "postgresql://u:secret@ep-other-hill-d4e5f6-pooler.eu-central-1.aws.neon.tech/neondb";

function cli(databaseUrl: string, args: readonly string[], prodEndpoint?: string) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PROD_GUARD_ENV_FILE: NO_ENV_FILE,
    PROD_NEON_ENDPOINT: prodEndpoint,
  };
  if (prodEndpoint === undefined) delete env.PROD_NEON_ENDPOINT;
  const result = spawnSync(
    "npx",
    ["tsx", "--import", "./test/no-network.mjs", "src/auth-revoke-all.ts", ...args],
    {
      cwd: PKG,
      encoding: "utf8",
      shell: process.platform === "win32",
      env,
      timeout: SPAWN_TIMEOUT_MS,
    },
  );
  const stdoutLines = result.stdout.split(/\r?\n/).filter((line) => line !== "");
  return { ...result, stdoutLines, output: `${result.stdout}${result.stderr}` };
}

describe("auth:revoke-all, the CLI", { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  const local = new URL(TEST_DATABASE_URL);
  const localTargetLine = `Target: local (${local.host}${local.pathname})`;

  it("a dry run prints the target, then both counts, and deletes nothing", async () => {
    await fixtures();
    const run = cli(TEST_DATABASE_URL, []);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdoutLines[0]).toBe(localTargetLine);
    expect(run.stdout).toContain("DRY RUN (nothing is deleted)");
    expect(run.stdout).toMatch(/^ {2}auth_session +3$/m);
    expect(run.stdout).toMatch(/^ {2}auth_verification +2$/m);
    expect(run.stdout).toContain("Nothing was deleted.");
    expect(await purged()).toEqual({ auth_session: 3, auth_verification: 2 });
  });

  it("--commit empties both tables, prints what it deleted, and leaves auth_user, auth_member and the shelter", async () => {
    await fixtures();
    const before = await countsOf(UNTOUCHED);
    const run = cli(TEST_DATABASE_URL, ["--commit"]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdoutLines[0]).toBe(localTargetLine);
    expect(run.stdout).toContain("COMMIT");
    expect(run.stdout).toMatch(/^ {2}auth_session +3$/m);
    expect(run.stdout).toMatch(/^ {2}auth_verification +2$/m);
    expect(await purged()).toEqual({ auth_session: 0, auth_verification: 0 });
    const after = await countsOf(UNTOUCHED);
    expect([after.auth_user, after.auth_member, after.shelters]).toEqual([2, 1, 1]);
    expect(after).toEqual(before);
    // The dry run afterwards: 0 and 0.
    const again = cli(TEST_DATABASE_URL, []);
    expect(again.stdout).toMatch(/^ {2}auth_session +0$/m);
    expect(again.stdout).toMatch(/^ {2}auth_verification +0$/m);
  });

  it("refuses --expect for a local target", async () => {
    await fixtures();
    const run = cli(TEST_DATABASE_URL, ["--expect", "ep-other-hill-d4e5f6", "--commit"]);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("names a Neon endpoint, but the target is local");
    expect(run.stdout).not.toContain("Target:");
    expect(await purged()).toEqual({ auth_session: 3, auth_verification: 2 });
  });

  it("refuses a non-local target without --expect, printing neither the URL nor a target", () => {
    const run = cli(CHILD_BRANCH, ["--commit"], PROD_ENDPOINT);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("pass --expect ep-…");
    expect(run.stdout).not.toContain("Target:");
    expect(run.output).not.toContain("secret");
  });

  it("refuses a non-local target whose compute isn't --expect", () => {
    const run = cli(CHILD_BRANCH, ["--expect", "ep-wrong-one-123456", "--commit"], PROD_ENDPOINT);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("the target's Neon endpoint is not --expect");
    expect(run.stdout).not.toContain("Target:");
    expect(run.output).not.toContain("secret");
  });

  it("refuses production with --prod but the wrong --expect", () => {
    const run = cli(
      PROD_DIRECT,
      ["--prod", "--expect", "ep-other-hill-d4e5f6", "--commit"],
      PROD_ENDPOINT,
    );
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("the target's Neon endpoint is not --expect");
    expect(run.stdout).not.toContain("Target:");
    expect(run.output).not.toContain("secret");
  });

  it("refuses production without --prod, even with the right --expect", () => {
    const run = cli(PROD_DIRECT, ["--expect", PROD_ENDPOINT, "--commit"], PROD_ENDPOINT);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("this target is PRODUCTION");
    expect(run.stdout).not.toContain("Target:");
    expect(run.output).not.toContain("secret");
  });

  it("refuses every non-local target when production's endpoint is unknown (fails closed)", () => {
    const run = cli(CHILD_BRANCH, ["--expect", "ep-other-hill-d4e5f6"]);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("PROD_NEON_ENDPOINT is not set");
    expect(run.stdout).not.toContain("Target:");
  });

  it("refuses an argument it doesn't take before anything else, without echoing a pasted URL", () => {
    const run = cli(PROD_DIRECT, ["--prod", "--expect", PROD_ENDPOINT, PROD_DIRECT], PROD_ENDPOINT);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("argument 4 is not one this script takes");
    expect(run.stderr).not.toContain("PRODUCTION");
    expect(run.output).not.toContain("secret");
  });

  it("with the matching --expect, prints the target first and only then reaches the database", () => {
    const run = cli(CHILD_BRANCH, ["--expect", "ep-other-hill-d4e5f6"], PROD_ENDPOINT);
    expect(run.stdoutLines[0]).toBe(
      "Target: Neon endpoint ep-other-hill-d4e5f6 (ep-other-hill-d4e5f6-pooler.eu-central-1.aws.neon.tech)",
    );
    // It failed on the blocked network, not somewhere before reaching it.
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain("network disabled by test/no-network.mjs");
    expect(run.output).not.toContain("secret");
  });
});

describe("the purge is reachable only from the CLI and the Neon smoke", () => {
  const REPO = resolve(PKG, "../..");
  const SOURCE_ROOTS = [
    "apps/web/src",
    "packages/db/src",
    "packages/domain/src",
    "packages/contracts/src",
    "packages/ui/src",
    "packages/i18n/src",
  ];
  const sourceFiles = (): string[] => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          files.push(relative(REPO, path).replaceAll("\\", "/"));
        }
      }
    };
    for (const root of SOURCE_ROOTS) walk(join(REPO, root));
    return files.sort();
  };
  // An import or re-export of the module, static or dynamic; comments may name it.
  const IMPORTS_IT =
    /from\s+["'][^"']*auth-revoke-repo["']|import\(\s*["'][^"']*auth-revoke-repo["']/;

  it("no request path, and not the package's repos entry point, imports authRevokeRepo", () => {
    const importers = sourceFiles().filter((file) =>
      IMPORTS_IT.test(readFileSync(join(REPO, file), "utf8")),
    );
    expect(importers, "only the operator CLI may import the sign-everyone-out repository").toEqual([
      "packages/db/src/auth-revoke-all.ts",
    ]);
  });
});
