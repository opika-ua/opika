import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { authMember, authOrganization, authUser, superAdmins } from "../src/schema/auth";
import { notificationSends } from "../src/schema/notification-sends";
import { shelterHistory } from "../src/schema/shelter-history";
import { shelters } from "../src/schema/shelters";
import { setupTestDatabase } from "../src/test-utils/index";
import { runNotificationRecipientsSmoke } from "./neon-smoke-notification-recipients";

/** The notification recipients smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runNotificationRecipientsSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  const leftovers = async () => ({
    users: (await db.select().from(authUser)).length,
    grants: (await db.select().from(superAdmins)).length,
    members: (await db.select().from(authMember)).length,
    organizations: (await db.select().from(authOrganization)).length,
    shelters: (await db.select().from(shelters)).length,
    history: (await db.select().from(shelterHistory)).length,
    sends: (await db.select().from(notificationSends)).length,
  });

  it("passes every check, there are 13, and every fixture row is gone", async () => {
    const outcomes = await runNotificationRecipientsSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(13);
    expect(await leftovers()).toEqual({
      users: 0,
      grants: 0,
      members: 0,
      organizations: 0,
      shelters: 0,
      history: 0,
      sends: 0,
    });
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
    const outcomes = await runNotificationRecipientsSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(13);
    expect(await leftovers()).toEqual({
      users: 0,
      grants: 0,
      members: 0,
      organizations: 0,
      shelters: 0,
      history: 0,
      sends: 0,
    });
  });
});
