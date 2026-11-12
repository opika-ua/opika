import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { r2UnreferencedObjects } from "../src/schema/r2-cleanup";
import { setupTestDatabase } from "../src/test-utils/index";
import { runPhotoSourcesSmoke } from "./neon-smoke-photo-sources";

/** The 0027 smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runPhotoSourcesSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, there are 11, and leaves no clean-up tracking row behind", async () => {
    const outcomes = await runPhotoSourcesSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(11);
    expect(await db.select().from(r2UnreferencedObjects)).toEqual([]);
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
    const outcomes = await runPhotoSourcesSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(11);
  });
});
