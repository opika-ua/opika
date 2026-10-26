import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleR2CleanupCron } from "./r2-cleanup-cron";
import type { R2CleanupState } from "./r2-cleanup-env";

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
const ON: R2CleanupState = {
  kind: "on",
  config: {
    accountId: "acct",
    bucketName: "photos",
    accessKeyId: "id",
    secretAccessKey: "not-a-secret",
  },
};

async function run(
  headers: Record<string, string>,
  overrides: { cronSecret?: string | undefined; r2State?: R2CleanupState } = {},
) {
  const lines: string[] = [];
  const response = await handleR2CleanupCron(
    new Request("https://opika.example/api/cron/r2-cleanup", { headers }),
    {
      cronSecret: "cronSecret" in overrides ? overrides.cronSecret : SECRET,
      db: () => db,
      now: new Date("2026-10-25T04:00:00.000Z"),
      r2State: overrides.r2State ?? ON,
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

  it("calls runR2Cleanup with commit: true and no graceDays override — pinned, not asserted by trust (Tier 1 review, note 5)", async () => {
    const calls: unknown[] = [];
    vi.doMock("@opika/db/image-pipeline/server", () => ({
      createR2CleanupClient: () => ({
        listObjectKeys: async () => [],
        deleteObjects: async () => ({ deleted: [], failed: [] }),
      }),
      runR2Cleanup: async (...args: unknown[]) => {
        calls.push(args);
        return {
          scanned: 0,
          newlyTracked: 0,
          clearedBack: 0,
          dueForDeletion: [],
          deleted: [],
          failed: [],
          snapshotsNulled: 0,
        };
      },
    }));
    await run({ authorization: `Bearer ${SECRET}` });
    expect(calls).toHaveLength(1);
    const [, , , options] = calls[0] as [
      unknown,
      unknown,
      unknown,
      { commit: boolean; graceDays: number | undefined },
    ];
    expect(options).toEqual({ commit: true, graceDays: undefined });
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

  it("deliberately off (no R2 credentials set): answers 200, quiet — never a daily false alarm", async () => {
    // Tier 1 review, PR #200, low finding: before this, "off" and "broken"
    // were the same response (500), so the cron reported a daily "failure"
    // in Vercel's own monitoring for as long as the job was left off on
    // purpose, which is the expected state before Oleksii enables it.
    const { response, lines } = await run(
      { authorization: `Bearer ${SECRET}` },
      { r2State: { kind: "off" } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "off" });
    expect(lines.map((l) => JSON.parse(l))).toEqual([{ event: "r2_cleanup", outcome: "off" }]);
  });

  it("misconfigured (a half-entered credential, or a padded value): refuses with 500 rather than silently doing nothing", async () => {
    const { response, lines } = await run(
      { authorization: `Bearer ${SECRET}` },
      { r2State: { kind: "misconfigured", problem: "R2_CLEANUP_SECRET_ACCESS_KEY must be set" } },
    );
    expect(response.status).toBe(500);
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { event: "r2_cleanup", outcome: "refused_misconfigured" },
    ]);
  });

  it("logs counts only — no object key, storage key or animal id, even when the report carries real ones", async () => {
    // Tier 1 review, PR #200, note 8: the report this mock returns must
    // actually carry keys in dueForDeletion/deleted/failed, or this test
    // passes trivially (nothing to leak) regardless of what the handler
    // logs. Real-shaped keys in every array a future change might log.
    vi.doMock("@opika/db/image-pipeline/server", () => ({
      createR2CleanupClient: () => ({
        listObjectKeys: async () => ["animals/secret-id/card.webp"],
        deleteObjects: async () => ({ deleted: [], failed: [] }),
      }),
      runR2Cleanup: async () => ({
        scanned: 1,
        newlyTracked: 1,
        clearedBack: 0,
        dueForDeletion: ["animals/due-secret/card.webp"],
        deleted: ["animals/deleted-secret/card.webp"],
        failed: [{ key: "animals/failed-secret/card.webp", message: "AccessDenied" }],
        snapshotsNulled: 1,
      }),
    }));
    const { lines } = await run({ authorization: `Bearer ${SECRET}` });
    expect(lines).toHaveLength(1);
    for (const secretish of [
      "animals/secret-id",
      "animals/due-secret",
      "animals/deleted-secret",
      "animals/failed-secret",
      "AccessDenied",
      SECRET,
    ]) {
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
