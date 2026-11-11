import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeRows } from "../src/raw-rows";
import { isCheckViolation } from "../src/repos/kabinet-animal-repo";
import { notificationSends } from "../src/schema/notification-sends";
import { setupTestDatabase, truncateAll } from "../src/test-utils/index";

/** Migration 0025: the status CHECK, the retry-sweep index, and the nullable reminder column. */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-11-10T06:00:00.000Z");
const row = (status: string, attempts = 1) => ({
  dedupKey: `k-${status}-${attempts}`,
  kind: "approved",
  status: status as "sent",
  attempts,
  createdAt: NOW,
  updatedAt: NOW,
});

describe("notification_sends constraints", () => {
  it("accepts the three statuses", async () => {
    for (const status of ["claimed", "sent", "failed"]) {
      await db.insert(notificationSends).values(row(status));
    }
    expect(await db.select().from(notificationSends)).toHaveLength(3);
  });

  it("refuses any other status with a check violation", async () => {
    let error: unknown;
    try {
      await db.insert(notificationSends).values(row("queued"));
    } catch (caught) {
      error = caught;
    }
    expect(isCheckViolation(error)).toBe(true);
  });

  it("refuses a row with no kind or no timestamps", async () => {
    await expect(
      db.execute(sql`INSERT INTO notification_sends (dedup_key, status) VALUES ('x', 'claimed')`),
    ).rejects.toThrow();
  });

  it("has the (status, created_at) index for the retry sweep", async () => {
    const rows = await executeRows<{ indexdef: string }>(
      db,
      sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'notification_sends' AND indexname = 'notification_sends_status_created_idx'`,
    );
    expect(rows[0]?.indexdef).toContain("(status, created_at)");
  });
});

describe("shelters.freshness_reminder_off_at", () => {
  it("is a nullable timestamptz column", async () => {
    const rows = await executeRows<{ data_type: string; is_nullable: string }>(
      db,
      sql`SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'shelters' AND column_name = 'freshness_reminder_off_at'`,
    );
    expect(rows).toEqual([{ data_type: "timestamp with time zone", is_nullable: "YES" }]);
  });
});
