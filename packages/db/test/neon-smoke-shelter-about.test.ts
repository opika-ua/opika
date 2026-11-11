import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { setupTestDatabase } from "../src/test-utils/index";
import { runShelterAboutSmoke } from "./neon-smoke-shelter-about";

/** The 0026 smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runShelterAboutSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 9", async () => {
    const outcomes = await runShelterAboutSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(9);
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
    const outcomes = await runShelterAboutSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
  });
});
