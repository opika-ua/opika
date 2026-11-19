import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { setupTestDatabase } from "../src/test-utils/index";
import { runApplicationsSmoke } from "./neon-smoke-applications";

/** The queue smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runApplicationsSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  // The R2 clean-up reads every photo storageKey; a keyless element left behind crashes its next run.
  const keylessPhotos = async () => {
    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM animals, jsonb_array_elements(photos) AS p WHERE p->>'storageKey' IS NULL`,
    );
    return Array.from(rows)[0]?.n;
  };

  it("passes every check, and there are 8", async () => {
    const outcomes = await runApplicationsSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(8);
    expect(await keylessPhotos()).toBe(0);
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
    const outcomes = await runApplicationsSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(await keylessPhotos()).toBe(0);
  });
});
