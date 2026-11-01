import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authExpiryRepo, KABINET_SESSION_LIMITS } from "../src/repos/auth-expiry-repo";
import { authSession, authUser, authVerification, superAdmins } from "../src/schema/auth";
import { setupTestDatabase, truncateAll } from "../src/test-utils/index";

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-14T03:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const USER = "aaaaaaaa-0000-4000-8000-00000000000a";

async function user() {
  await db.insert(authUser).values({
    id: USER,
    name: "Олена",
    email: "olena@example.org",
    emailVerified: true,
    createdAt: at(-30 * 86_400_000),
    updatedAt: at(-30 * 86_400_000),
  });
}

const session = (id: string, expiresAt: Date) => ({
  id,
  token: `token-${id}`,
  userId: USER,
  expiresAt,
  createdAt: at(-8 * 86_400_000),
  updatedAt: at(-8 * 86_400_000),
});

const verification = (id: string, expiresAt: Date) => ({
  id,
  identifier: `hashed-${id}`,
  value: JSON.stringify({ email: "olena@example.org" }),
  expiresAt,
  createdAt: at(-60 * 60_000),
  updatedAt: at(-60 * 60_000),
});

const ids = async () => ({
  sessions: (await db.select({ id: authSession.id }).from(authSession)).map((r) => r.id).sort(),
  verifications: (await db.select({ id: authVerification.id }).from(authVerification))
    .map((r) => r.id)
    .sort(),
});

describe("authExpiryRepo.deleteExpired (KH-Q9)", () => {
  beforeEach(async () => {
    await user();
    await db
      .insert(authSession)
      .values([
        session("s-expired", at(-1)),
        session("s-boundary", NOW),
        session("s-live", at(86_400_000)),
      ]);
    await db
      .insert(authVerification)
      .values([
        verification("v-expired", at(-1)),
        verification("v-boundary", NOW),
        verification("v-live", at(15 * 60_000)),
      ]);
  });

  it("deletes rows past expiry, keeps live ones, and keeps a row expiring exactly now", async () => {
    expect(await authExpiryRepo(db).deleteExpired(NOW)).toEqual({ verifications: 1, sessions: 1 });
    expect(await ids()).toEqual({
      sessions: ["s-boundary", "s-live"],
      verifications: ["v-boundary", "v-live"],
    });
  });

  it("a millisecond later the boundary rows are dead too (strict <, as Better Auth)", async () => {
    expect(await authExpiryRepo(db).deleteExpired(at(1))).toEqual({
      verifications: 2,
      sessions: 2,
    });
    expect(await ids()).toEqual({ sessions: ["s-live"], verifications: ["v-live"] });
  });

  it("answers zero counts, as numbers, when nothing is expired", async () => {
    await authExpiryRepo(db).deleteExpired(NOW);
    expect(await authExpiryRepo(db).deleteExpired(NOW)).toEqual({ verifications: 0, sessions: 0 });
  });

  it("leaves the user row alone", async () => {
    await authExpiryRepo(db).deleteExpired(at(10 * 86_400_000));
    expect(await db.select({ id: authUser.id }).from(authUser)).toEqual([{ id: USER }]);
  });
});

/**
 * Sessions by role (F-B9; §9 answers 3 and 6, verbatim in `KABINET_SESSION_LIMITS`'s comment):
 * a shelter admin's session lives 30 days since its last refresh and 90 days at most; the
 * operator's (an active super_admin grant) 7 and 30. EM-Q11's rule stands for both, verbatim:
 * "The cleanup also deletes sessions older than the 30-day absolute cap. Same statement plus one
 * condition. Test the case where the cap is passed but the idle expiry is in the future." Better
 * Auth's own `expires_at` is in the future for every row here, so each deletion is a limit's.
 * The limits are written out, not read from the constant under test.
 */
describe("authExpiryRepo.deleteExpired: the limits by role", () => {
  const DAY = 86_400_000;
  const FUTURE = at(60 * DAY);
  const OPERATOR = "bbbbbbbb-0000-4000-8000-00000000000b";
  const FORMER_OPERATOR = "cccccccc-0000-4000-8000-00000000000c";

  async function users() {
    await user();
    const old = at(-120 * DAY);
    await db.insert(authUser).values([
      {
        id: OPERATOR,
        name: "Оператор",
        email: "op@example.org",
        emailVerified: true,
        createdAt: old,
        updatedAt: old,
      },
      {
        id: FORMER_OPERATOR,
        name: "Колишній",
        email: "was@example.org",
        emailVerified: true,
        createdAt: old,
        updatedAt: old,
      },
    ]);
    await db.insert(superAdmins).values([
      { id: "grant-live", userId: OPERATOR, grantedAt: old },
      { id: "grant-revoked", userId: FORMER_OPERATOR, grantedAt: old, revokedAt: at(-DAY) },
    ]);
  }

  const row = (id: string, userId: string, createdAt: Date, updatedAt: Date) => ({
    id,
    token: `token-${id}`,
    userId,
    expiresAt: FUTURE,
    createdAt,
    updatedAt,
  });

  beforeEach(async () => {
    await users();
    await db.insert(authSession).values([
      // A shelter admin: idle 30 days, cap 90 days.
      row("admin-idle-past", USER, at(-40 * DAY), at(-30 * DAY - 1)),
      row("admin-idle-at", USER, at(-40 * DAY), at(-30 * DAY)),
      row("admin-cap-past", USER, at(-90 * DAY - 1), at(-DAY)),
      row("admin-cap-at", USER, at(-90 * DAY), at(-DAY)),
      // Past the operator's limits, inside the shelter admin's: kept for her.
      row("admin-would-lapse-as-operator", USER, at(-60 * DAY), at(-20 * DAY)),
      // The operator: idle 7 days, cap 30 days.
      row("op-idle-past", OPERATOR, at(-10 * DAY), at(-7 * DAY - 1)),
      row("op-idle-at", OPERATOR, at(-10 * DAY), at(-7 * DAY)),
      row("op-cap-past", OPERATOR, at(-30 * DAY - 1), at(-DAY)),
      row("op-cap-at", OPERATOR, at(-30 * DAY), at(-DAY)),
      // A revoked grant is history, not a role: the shelter admin's limits apply.
      row("former-op-past-operator-limits", FORMER_OPERATOR, at(-60 * DAY), at(-20 * DAY)),
    ]);
  });

  it("the numbers are 30/90 days for shelter admins and 7/30 for the operator", () => {
    expect(KABINET_SESSION_LIMITS).toEqual({
      shelterAdmin: { idleMs: 30 * DAY, absoluteMs: 90 * DAY },
      operator: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
    });
  });

  it("deletes past each holder's idle limit and cap; keeps a row exactly at a limit", async () => {
    expect(await authExpiryRepo(db).deleteExpired(NOW)).toEqual({ verifications: 0, sessions: 4 });
    expect((await ids()).sessions).toEqual(
      [
        "admin-cap-at",
        "admin-idle-at",
        "admin-would-lapse-as-operator",
        "former-op-past-operator-limits",
        "op-cap-at",
        "op-idle-at",
      ].sort(),
    );
  });

  it("a millisecond later the rows at a limit are past it too", async () => {
    await authExpiryRepo(db).deleteExpired(NOW);
    expect(await authExpiryRepo(db).deleteExpired(at(1))).toEqual({
      verifications: 0,
      sessions: 4,
    });
    expect((await ids()).sessions).toEqual(
      ["admin-would-lapse-as-operator", "former-op-past-operator-limits"].sort(),
    );
  });

  it("leaves users, grants and verification rows alone", async () => {
    await db.insert(authVerification).values([verification("v-live", at(2 * DAY))]);
    await authExpiryRepo(db).deleteExpired(at(DAY));
    expect((await ids()).verifications).toEqual(["v-live"]);
    expect((await db.select({ id: authUser.id }).from(authUser)).length).toBe(3);
    expect((await db.select({ id: superAdmins.id }).from(superAdmins)).length).toBe(2);
  });
});
