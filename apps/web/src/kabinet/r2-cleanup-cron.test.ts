import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleR2CleanupCron, type R2CleanupCronConfig } from "./r2-cleanup-cron";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). The orchestration itself
 * (`runR2Cleanup`) is tested thoroughly against a real database in
 * `packages/db/test/r2-cleanup.test.ts`; this covers the route's own
 * boundary — the cron secret, the missing-R2-config refusal, and that
 * nothing it logs names a key — the same shape `auth-cleanup.test.ts`
 * already pins for the sibling cron.
 */
let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const SECRET = "cron-secret-for-tests-0123456789abcdef";
const R2: R2CleanupCronConfig = {
  accountId: "acct",
  bucketName: "photos",
  accessKeyId: "id",
  secretAccessKey: "not-a-secret",
};

async function run(
  headers: Record<string, string>,
  overrides: { cronSecret?: string | undefined; r2?: R2CleanupCronConfig | undefined } = {},
) {
  const lines: string[] = [];
  const response = await handleR2CleanupCron(
    new Request("https://opika.example/api/cron/r2-cleanup", { headers }),
    {
      cronSecret: "cronSecret" in overrides ? overrides.cronSecret : SECRET,
      db: () => db,
      now: new Date("2026-10-25T04:00:00.000Z"),
      r2: "r2" in overrides ? overrides.r2 : R2,
      log: (line) => lines.push(line),
    },
  );
  return { response, lines };
}

describe("the R2 clean-up cron's own boundary", () => {
  it("with the secret and R2 configured: runs and reports counts, no bucket objects today", async () => {
    vi.doMock("@opika/db/image-pipeline/server", () => ({
      createR2CleanupClient: () => ({
        listObjectKeys: async () => [],
        deleteObjects: async () => ({ deleted: [], failed: [] }),
      }),
      runR2Cleanup: async (_db: unknown, _r2: unknown, _now: Date, _opts: unknown) => ({
        scanned: 0,
        newlyTracked: 0,
        clearedBack: 0,
        dueForDeletion: [],
        deleted: [],
        failed: [],
        snapshotsNulled: 0,
      }),
    }));
    const { response, lines } = await run({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      scanned: 0,
      newlyTracked: 0,
      clearedBack: 0,
      dueForDeletion: 0,
      deleted: 0,
      failed: 0,
      snapshotsNulled: 0,
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ event: "r2_cleanup", outcome: "ran" });
    vi.doUnmock("@opika/db/image-pipeline/server");
  });

  it.each([
    ["no Authorization header", {}],
    ["a wrong secret", { authorization: "Bearer not-the-secret" }],
    ["the secret without the Bearer scheme", { authorization: SECRET }],
  ])("refuses %s with 401 and runs nothing", async (_label, headers) => {
    const { response, lines } = await run(headers);
    expect(response.status).toBe(401);
    expect(lines).toEqual([]);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("CRON_SECRET %s: refuses with 500, fail closed, and runs nothing", async (_label, secret) => {
    const { response, lines } = await run(
      { authorization: `Bearer ${SECRET}` },
      { cronSecret: secret },
    );
    expect(response.status).toBe(500);
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { event: "r2_cleanup", outcome: "refused_no_secret" },
    ]);
  });

  it("missing R2 config: refuses with 500 rather than silently doing nothing", async () => {
    const { response, lines } = await run({ authorization: `Bearer ${SECRET}` }, { r2: undefined });
    expect(response.status).toBe(500);
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { event: "r2_cleanup", outcome: "refused_no_r2_config" },
    ]);
  });

  it("logs counts only — no object key, storage key or animal id, even with a real referenced photo", async () => {
    vi.doMock("@opika/db/image-pipeline/server", () => ({
      createR2CleanupClient: () => ({
        listObjectKeys: async () => ["animals/secret-id/card.webp"],
        deleteObjects: async () => ({ deleted: [], failed: [] }),
      }),
      runR2Cleanup: async () => ({
        scanned: 1,
        newlyTracked: 1,
        clearedBack: 0,
        dueForDeletion: [],
        deleted: [],
        failed: [],
        snapshotsNulled: 0,
      }),
    }));
    const { lines } = await run({ authorization: `Bearer ${SECRET}` });
    expect(lines).toHaveLength(1);
    for (const secretish of ["animals/secret-id", SECRET]) {
      expect(lines[0]).not.toContain(secretish);
    }
    vi.doUnmock("@opika/db/image-pipeline/server");
  });
});

const R2_CLEANUP_PATH = "/api/cron/r2-cleanup";
const WEB = resolve(fileURLToPath(import.meta.url), "../../..");
const vercelConfig = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};
const r2CleanupCrons = vercelConfig.crons?.filter((c) => c.path === R2_CLEANUP_PATH) ?? [];

describe("the R2 clean-up is scheduled and reachable", () => {
  it("apps/web/vercel.json has exactly one schedule for /api/cron/r2-cleanup", () => {
    expect(r2CleanupCrons).toHaveLength(1);
  });

  it("the path has a GET route and skips the pre-launch gate", async () => {
    expect(existsSync(join(WEB, "src/app/api/cron/r2-cleanup/route.ts"))).toBe(true);
    const { GET } = await import("../app/api/cron/r2-cleanup/route");
    expect(typeof GET).toBe("function");
    const { isCronPath } = await import("../proxy");
    expect(isCronPath(R2_CLEANUP_PATH)).toBe(true);
  });
});
