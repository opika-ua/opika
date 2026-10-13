import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { committedHashes, compareHashes } from "../src/check-migration-hashes";
import { setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * RS-R1 (Oleksii): after a rehearsal, "the migration journal hash for 0011 on
 * the rehearsal branch must match the committed file". This runs the check
 * against a database migrated from the committed files, where every
 * migration must match, and proves a changed file shows as a mismatch.
 */

let cleanup: () => Promise<void>;
const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });

beforeAll(async () => {
  cleanup = (await setupTestDatabase()).cleanup;
});
afterAll(async () => {
  await client.end();
  await cleanup?.();
});

const recorded = async () =>
  (await client`SELECT hash, created_at FROM drizzle.__drizzle_migrations`) as unknown as {
    hash: string;
    created_at: string;
  }[];

describe("db:check-hashes", () => {
  it("matches every committed migration on a database migrated from those files", async () => {
    const checks = compareHashes(committedHashes(), await recorded());
    expect(checks.length).toBeGreaterThan(10);
    expect(checks.filter((check) => check.status !== "match")).toEqual([]);
    expect(checks.map((check) => check.tag)).toContain("0011_lovely_black_knight");
  });

  it("reports a migration whose committed file differs from what ran as a mismatch", async () => {
    const committed = committedHashes().map((entry) =>
      entry.tag.startsWith("0011_") ? { ...entry, hash: "0".repeat(64) } : entry,
    );
    const checks = compareHashes(committed, await recorded());
    expect(checks.find((check) => check.tag.startsWith("0011_"))?.status).toBe("mismatch");
    expect(checks.filter((check) => check.status === "mismatch")).toHaveLength(1);
  });

  it("reports a migration the database never ran as not applied", () => {
    const checks = compareHashes([{ tag: "9999_future", when: 1, hash: "x" }], []);
    expect(checks).toEqual([{ tag: "9999_future", status: "not_applied" }]);
  });
});
