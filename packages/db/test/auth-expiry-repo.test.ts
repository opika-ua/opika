import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authExpiryRepo, KABINET_SESSION_ABSOLUTE_MS } from "../src/repos/auth-expiry-repo";
import { authSession, authUser, authVerification } from "../src/schema/auth";
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
 * EM-Q11 (Oleksii, 2026-10-14, verbatim): "The cleanup also deletes sessions
 * older than the 30-day absolute cap. Same statement plus one condition. Test
 * the case where the cap is passed but the idle expiry is in the future."
 */
describe("authExpiryRepo.deleteExpired: the 30-day absolute cap (EM-Q11)", () => {
  const DAY = 86_400_000;
  // The cap, written out rather than read from the constant under test.
  const CAP = 30 * DAY;
  const FUTURE = at(5 * DAY);
  const created = (id: string, createdAt: Date, expiresAt: Date) => ({
    ...session(id, expiresAt),
    createdAt,
    updatedAt: at(-DAY),
  });

  beforeEach(async () => {
    await user();
    await db
      .insert(authSession)
      .values([
        created("s-past-cap", at(-CAP - 1), FUTURE),
        created("s-at-cap", at(-CAP), FUTURE),
        created("s-under-cap", at(-CAP + 1), FUTURE),
        created("s-young", at(-DAY), FUTURE),
      ]);
    await db.insert(authVerification).values([verification("v-live", at(15 * 60_000))]);
  });

  it("is the 30 days the kabinet's own cap uses", () => {
    expect(KABINET_SESSION_ABSOLUTE_MS).toBe(CAP);
  });

  it("deletes a session past the cap whose idle expiry is still in the future", async () => {
    expect(await authExpiryRepo(db).deleteExpired(NOW)).toEqual({ verifications: 0, sessions: 1 });
    expect(await ids()).toEqual({
      sessions: ["s-at-cap", "s-under-cap", "s-young"],
      verifications: ["v-live"],
    });
  });

  it("keeps one exactly at the cap (the hook's `>` too), and takes it a millisecond later", async () => {
    await authExpiryRepo(db).deleteExpired(NOW);
    expect((await ids()).sessions).toContain("s-at-cap");
    expect(await authExpiryRepo(db).deleteExpired(at(1))).toEqual({
      verifications: 0,
      sessions: 1,
    });
    expect((await ids()).sessions).toEqual(["s-under-cap", "s-young"]);
  });

  it("leaves verification rows to their own expiry, and the user alone", async () => {
    await authExpiryRepo(db).deleteExpired(at(10 * 60_000));
    expect((await ids()).verifications).toEqual(["v-live"]);
    expect(await db.select({ id: authUser.id }).from(authUser)).toEqual([{ id: USER }]);
  });
});
