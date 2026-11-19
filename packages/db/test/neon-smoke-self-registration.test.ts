import { randomUUID } from "node:crypto";
import { eq, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { authUser } from "../src/schema/auth";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { runSelfRegistrationSmoke } from "./neon-smoke-self-registration";

/** The 0028 smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runSelfRegistrationSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 11", async () => {
    const outcomes = await runSelfRegistrationSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(11);
  });

  it("passes the same over a driver whose raw results are `{ rows }`", async () => {
    const neonHttpRawShape = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "execute") {
          return async (query: SQL) => ({
            rows: Array.from(await target.execute(query)),
            fields: [],
          });
        }
        return Reflect.get(target, property, receiver);
      },
    }) as Database;
    const outcomes = await runSelfRegistrationSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
  });

  it("a real application already stored passes the 0028 shape check; one missing its registrant fails it", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const now = new Date();
    const stored = async (registrant: string | null) => {
      const shelter = makeShelter({
        publicLocation: { precision: "city", cityId: city.id, district: null },
        verification: {
          status: "application",
          appliedAt: now,
          evidence: { items: [], submittedAt: now },
        },
      });
      await shelterRepo(db).insert(shelter);
      if (registrant !== null) {
        await db
          .update(shelters)
          .set({ registrantUserId: registrant })
          .where(eq(shelters.id, shelter.id));
      }
    };
    const userId = randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Заявниця",
      email: `applied-${userId}@example.org`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    const shape = async () =>
      (await runSelfRegistrationSmoke(db)).find((o) => o.name.startsWith("0028: every shelter"));

    await stored(userId);
    expect(await shape()).toMatchObject({
      ok: true,
      detail: expect.stringContaining("1 self-registered, 0 other"),
    });

    await stored(null);
    expect(await shape()).toMatchObject({ ok: false, detail: expect.stringContaining("1 other") });
  });
});
