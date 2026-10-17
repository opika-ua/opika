import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { committedHashes, compareHashes, isFailure } from "../src/check-migration-hashes";
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
    expect(checks.some((check) => check.tag?.startsWith("0011_"))).toBe(true);
  });

  it("reports a migration whose committed file differs from what ran as a mismatch", async () => {
    const committed = committedHashes().map((entry) =>
      entry.tag.startsWith("0011_") ? { ...entry, hash: "0".repeat(64) } : entry,
    );
    const checks = compareHashes(committed, await recorded());
    expect(checks.find((check) => check.tag?.startsWith("0011_"))?.status).toBe("mismatch");
    expect(checks.filter((check) => check.status === "mismatch")).toHaveLength(1);
  });

  /**
   * RS-R1: 0011 is frozen as of 6b7fa12, before any rehearsal; anything later
   * goes in 0012. This pins the committed file, so an edit to it fails here
   * rather than surfacing as a hash mismatch on a rehearsed branch.
   */
  it("0011 is frozen at the content committed in 6b7fa12 (RS-R1)", () => {
    const frozen = committedHashes().find((entry) => entry.tag.startsWith("0011_"));
    expect(frozen?.hash).toBe("78f140f35f10245321754fc6f3173bdf6be9a85a257a2664cc09e0e06a278f04");
  });

  it("reports a migration the database never ran as not applied", () => {
    const checks = compareHashes([{ tag: "9999_future", when: 1, hash: "x" }], []);
    expect(checks).toEqual([{ tag: "9999_future", status: "not_applied" }]);
  });

  /**
   * The drift RS-R1 exists to catch: a branch ran the newest migration, then
   * it was regenerated (new journal `when`, new content). The old row matches
   * no committed migration and must fail the check, not read as "not run".
   * Written for 0011 when it was the newest; it takes whichever migration is
   * newest now (0012 since K3), because an older one regenerated under a newer
   * applied one is the stricter `skipped` case, tested below.
   */
  it("fails when the database ran a newest migration that has since been regenerated", async () => {
    const committed = committedHashes();
    const newest = committed.at(-1)?.tag;
    const regenerated = committed.map((entry) =>
      entry.tag === newest ? { ...entry, when: entry.when + 1, hash: "f".repeat(64) } : entry,
    );
    const checks = compareHashes(regenerated, await recorded());
    expect(checks.filter(isFailure).map((check) => check.status)).toEqual(["unknown"]);
    expect(checks.find((check) => check.tag === newest)?.status).toBe("not_applied");
  });

  it("fails when a migration is missing while a later one ran", () => {
    const committed = [
      { tag: "0001_a", when: 1, hash: "a" },
      { tag: "0002_b", when: 2, hash: "b" },
      { tag: "0003_c", when: 3, hash: "c" },
    ];
    const checks = compareHashes(committed, [
      { hash: "a", created_at: "1" },
      { hash: "c", created_at: "3" },
    ]);
    expect(checks.map((check) => check.status)).toEqual(["match", "skipped", "match"]);
    expect(checks.some(isFailure)).toBe(true);
  });
});
