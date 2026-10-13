import { cityRepo, SUPPORT_IDLE_MS, shelterRepo } from "@opika/db/repos";
import { authUser, supportSessions } from "@opika/db/schema";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, Shelter, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { KabinetPrincipal } from "./actor";
import {
  enterSupport,
  exitSupport,
  setSupportCookie,
  supportTokenOf,
  withSupportMode,
} from "./support";

/**
 * Support mode's resolution (RG-Q4, KABINET S5): a super_admin with an open
 * support session is a read-only view of one shelter; idle for 30 minutes it
 * ends; it never applies to anyone else, whatever cookie they carry.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const NOW = new Date("2026-10-13T10:00:00.000Z");
const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const OTHER_OPERATOR = "0ec0ec0e-0000-4000-8000-000000000002";
const asOperator: KabinetPrincipal = { kind: "super_admin", moderatorId: OPERATOR as ModeratorId };
let shelter: Shelter;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id } as never,
  });
  await shelterRepo(db).insert(shelter);
  for (const id of [OPERATOR, OTHER_OPERATOR]) {
    await db.insert(authUser).values({
      id,
      name: "Оператор",
      email: `${id}@example.org`,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
});

/** Enters support and returns the Cookie header a browser would send back. */
async function enter(at = NOW): Promise<string> {
  const setCookies: string[] = [];
  await enterSupport(
    { db, now: at, newId: () => crypto.randomUUID(), setCookies, production: false },
    OPERATOR as ModeratorId,
    shelter.id,
  );
  return setCookies[0]?.split(";")[0] ?? "";
}

const resolve = (principal: KabinetPrincipal, userId: string, cookie: string | null, at: Date) =>
  withSupportMode(db, principal, userId, cookie, at, false);

describe("withSupportMode", () => {
  it("makes the operator a support view of the shelter entered", async () => {
    const cookie = await enter();
    expect(await resolve(asOperator, OPERATOR, cookie, new Date(NOW.getTime() + 1000))).toEqual({
      kind: "support_view",
      moderatorId: OPERATOR,
      shelterId: shelter.id,
    });
  });

  it("keeps a view alive while it is used, and ends it as idle 30 minutes after the last use", async () => {
    const cookie = await enter();
    const justInside = new Date(NOW.getTime() + SUPPORT_IDLE_MS - 1);
    expect((await resolve(asOperator, OPERATOR, cookie, justInside)).kind).toBe("support_view");
    // The use above moved the clock: another 30 minutes from there is still fine...
    const stillAlive = new Date(justInside.getTime() + SUPPORT_IDLE_MS - 1);
    expect((await resolve(asOperator, OPERATOR, cookie, stillAlive)).kind).toBe("support_view");
    // ...and exactly 30 idle minutes later it has ended.
    const idle = new Date(stillAlive.getTime() + SUPPORT_IDLE_MS);
    expect(await resolve(asOperator, OPERATOR, cookie, idle)).toEqual(asOperator);
    const [row] = await db.select().from(supportSessions);
    expect(row).toMatchObject({
      endReason: "idle",
      endedAt: new Date(stillAlive.getTime() + SUPPORT_IDLE_MS),
    });
    // Ended stays ended, even if used again.
    expect(await resolve(asOperator, OPERATOR, cookie, idle)).toEqual(asOperator);
  });

  it("is bound to the operator who entered: another super_admin with the cookie is themselves", async () => {
    const cookie = await enter();
    const other: KabinetPrincipal = {
      kind: "super_admin",
      moderatorId: OTHER_OPERATOR as ModeratorId,
    };
    expect(await resolve(other, OTHER_OPERATOR, cookie, NOW)).toEqual(other);
  });

  it("never applies to a non-operator, cookie or not", async () => {
    const cookie = await enter();
    const admin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: OPERATOR as ShelterAdminId,
      shelterId: shelter.id,
    };
    expect(await resolve(admin, OPERATOR, cookie, NOW)).toEqual(admin);
    expect(await resolve({ kind: "no_role" }, OPERATOR, cookie, NOW)).toEqual({ kind: "no_role" });
  });

  it("is the operator themselves with no cookie, an unknown token, or after exit", async () => {
    expect(await resolve(asOperator, OPERATOR, null, NOW)).toEqual(asOperator);
    expect(await resolve(asOperator, OPERATOR, `kabinet.support=${"a".repeat(64)}`, NOW)).toEqual(
      asOperator,
    );
    const cookie = await enter();
    await exitSupport(
      { db, now: NOW, setCookies: [], production: false },
      OPERATOR as ModeratorId,
      cookie,
    );
    expect(await resolve(asOperator, OPERATOR, cookie, NOW)).toEqual(asOperator);
  });
});

describe("the support cookie", () => {
  it("is __Host- and Secure in production only", () => {
    expect(setSupportCookie("t", true)).toBe(
      "__Host-kabinet.support=t; HttpOnly; SameSite=Lax; Path=/; Secure",
    );
    expect(setSupportCookie("t", false)).toBe("kabinet.support=t; HttpOnly; SameSite=Lax; Path=/");
  });

  it("is read by its own name only, never another cookie's", () => {
    expect(supportTokenOf("session=abc; kabinet.support=tok", false)).toBe("tok");
    expect(supportTokenOf("kabinet.support=tok", true)).toBeNull();
    expect(supportTokenOf("__Host-kabinet.support=tok", true)).toBe("tok");
    expect(supportTokenOf(null, false)).toBeNull();
  });
});
