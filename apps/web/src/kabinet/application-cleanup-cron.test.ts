import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApplicationCleanupReport, Database } from "@opika/db";
import { describe, expect, it, vi } from "vitest";
import {
  APPLICATION_CLEANUP_SWITCH,
  applicationCleanupEnabled,
  handleApplicationCleanupCron,
} from "./application-cleanup-cron";

/**
 * The application clean-up's door and its switch. What a run deletes is tested over a real
 * database in `packages/db/test/application-deletion-repo.test.ts`.
 */

const SECRET = "cron-secret-value";
const request = (authorization?: string) =>
  new Request("https://example.org/api/cron/application-cleanup", {
    method: "GET",
    ...(authorization === undefined ? {} : { headers: { authorization } }),
  });

const EMPTY: ApplicationCleanupReport = {
  due: [],
  deferred: [],
  deleted: [],
  notDue: [],
  failed: [],
};

function harness(enabled: boolean, report: ApplicationCleanupReport = EMPTY) {
  const run = vi.fn(async () => report);
  const logs: string[] = [];
  const deps = {
    cronSecret: SECRET,
    enabled,
    db: () => ({}) as Database,
    now: new Date("2026-12-01T03:00:00.000Z"),
    log: (line: string) => logs.push(line),
    run,
  };
  return { run, logs, deps };
}

describe("the application clean-up cron", () => {
  it("refuses a wrong bearer and runs nothing", async () => {
    const { run, deps } = harness(true);
    const response = await handleApplicationCleanupCron(request("Bearer nope"), deps);
    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("is off until switched on: 200 «off», nothing selected or deleted", async () => {
    const { run, deps } = harness(false);
    const response = await handleApplicationCleanupCron(request(`Bearer ${SECRET}`), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "off" });
    expect(run).not.toHaveBeenCalled();
  });

  it("switched on, it commits and logs counts only", async () => {
    const shelterId = "5b0e8a43-6a3c-4c5e-9d6d-1f2a3b4c5d6e";
    const { run, logs, deps } = harness(true, {
      due: [{ shelterId: shelterId as never, reason: "abandoned" }],
      deferred: [],
      deleted: [{ shelterId, reason: "abandoned", photoKeys: 4 }],
      notDue: [],
      failed: [],
    });
    const response = await handleApplicationCleanupCron(request(`Bearer ${SECRET}`), deps);
    expect(await response.json()).toEqual({
      due: 1,
      deferred: 0,
      deleted: 1,
      notDue: 0,
      failed: 0,
    });
    expect(run).toHaveBeenCalledWith(expect.anything(), deps.now, { commit: true });
    expect(logs.join("\n")).not.toContain(shelterId);
  });

  it("only the exact value «on» switches it on", () => {
    expect(applicationCleanupEnabled({ [APPLICATION_CLEANUP_SWITCH]: "on" })).toBe(true);
    for (const value of [undefined, "", "ON", "1", "true", " on"]) {
      expect(applicationCleanupEnabled({ [APPLICATION_CLEANUP_SWITCH]: value })).toBe(false);
    }
  });

  it("apps/web/vercel.json schedules it daily at 03:00 UTC, before the R2 clean-up", () => {
    const web = resolve(fileURLToPath(import.meta.url), "../../..");
    const config = JSON.parse(readFileSync(join(web, "vercel.json"), "utf8")) as {
      crons?: { path: string; schedule: string }[];
    };
    expect(config.crons).toEqual(
      expect.arrayContaining([
        { path: "/api/cron/application-cleanup", schedule: "0 3 * * *" },
        { path: "/api/cron/r2-cleanup", schedule: "0 4 * * *" },
      ]),
    );
  });
});
