import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { notificationSends } from "../src/schema/notification-sends";
import { setupTestDatabase } from "../src/test-utils/index";
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
});
