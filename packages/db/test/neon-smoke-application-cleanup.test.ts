import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { setupTestDatabase } from "../src/test-utils/index";
import { runApplicationCleanupSmoke } from "./neon-smoke-application-cleanup";

/** Agent 4 and 0029 smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runApplicationCleanupSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 7", async () => {
    const outcomes = await runApplicationCleanupSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(7);
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
    const outcomes = await runApplicationCleanupSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
  });
});
