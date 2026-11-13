import { randomUUID } from "node:crypto";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { cityRepo } from "../src/repos/city-repo";
import { notificationSendsRepo } from "../src/repos/notification-sends-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { notificationSends } from "../src/schema/notification-sends";
import { makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { runNotificationSendsSmoke } from "./neon-smoke-notification-sends";

/** The 0025 smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runNotificationSendsSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, there are 9, and the table is back to 0 rows", async () => {
    const outcomes = await runNotificationSendsSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(9);
    expect(await db.select().from(notificationSends)).toEqual([]);
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
    const outcomes = await runNotificationSendsSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(9);
    expect(await db.select().from(notificationSends)).toEqual([]);
  });

  // A copy of production made before its six-hourly purge got to a row past 90 days, with a
  // shelter the operator switched off: neither is this run's, and neither may fail it.
  it("passes on a branch that already holds an unpurged old row and a switched-off shelter", async () => {
    const now = new Date();
    await notificationSendsRepo(db).claim(new Date(now.getTime() - 95 * 86_400_000), {
      dedupKey: `branch:${randomUUID()}`,
      kind: "approved",
      shelterId: null,
      recipientUserId: null,
    });
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({ freshnessReminderOffAt: now });
    await shelterRepo(db).insert({
      ...shelter,
      exactAddress: { ...shelter.exactAddress, cityId: city.id },
      publicLocation: { ...shelter.publicLocation, cityId: city.id },
    });
    const outcomes = await runNotificationSendsSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(9);
  });
});
