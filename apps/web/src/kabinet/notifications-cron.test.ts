import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { handleNotificationsCron } from "./notifications-cron";
import type { NotifyDeps } from "./notify/deliver";

/**
 * The daily notification cron's door: the same bearer rule as the other crons (`auth-cleanup`),
 * checked before anything is built or sent. What a run does is tested over a real database in
 * `notify/notify.test.ts`.
 */

const SECRET = "cron-secret-value";
const request = (authorization?: string) =>
  new Request("https://example.org/api/cron/notifications", {
    method: "GET",
    ...(authorization === undefined ? {} : { headers: { authorization } }),
  });

function harness(
  overrides: { cronSecret?: string | undefined; notify?: () => NotifyDeps | null } = {},
) {
  const logs: string[] = [];
  const notify = vi.fn(overrides.notify ?? (() => null));
  const pings: string[] = [];
  const fetchImpl = (async (url: string) => {
    pings.push(String(url));
    return new Response("OK");
  }) as unknown as typeof fetch;
  const deps = {
    cronSecret: "cronSecret" in overrides ? overrides.cronSecret : SECRET,
    notify,
    log: (line: string) => logs.push(line),
    healthcheckUrl: "https://hc.example.org/ping/abc",
    fetchImpl,
  };
  return { deps, logs, notify, pings };
}

describe("handleNotificationsCron: who may call it", () => {
  it("refuses everything with 500 while no CRON_SECRET is configured, and builds nothing", async () => {
    for (const cronSecret of [undefined, ""]) {
      const { deps, notify, logs, pings } = harness({ cronSecret });
      const response = await handleNotificationsCron(request(`Bearer ${SECRET}`), deps);
      expect(response.status).toBe(500);
      expect(notify).not.toHaveBeenCalled();
      expect(logs.join("")).toContain("refused_no_secret");
      expect(pings).toEqual(["https://hc.example.org/ping/abc/fail"]);
    }
  });

  it("answers 401 to a missing or wrong bearer, and builds nothing", async () => {
    for (const header of [
      undefined,
      "",
      SECRET,
      `Bearer ${SECRET}x`,
      "Bearer wrong",
      `bearer ${SECRET}`,
    ]) {
      const { deps, notify } = harness();
      const response = await handleNotificationsCron(request(header), deps);
      expect(response.status).toBe(401);
      expect(notify).not.toHaveBeenCalled();
    }
  });

  it("answers 503 and a failed check-in when this deployment cannot send", async () => {
    const { deps, pings, logs } = harness({ notify: () => null });
    const response = await handleNotificationsCron(request(`Bearer ${SECRET}`), deps);
    expect(response.status).toBe(503);
    expect(pings).toEqual(["https://hc.example.org/ping/abc/fail"]);
    expect(logs.join("")).toContain("not_configured");
  });

  it("works with no check-in URL at all", async () => {
    const { deps } = harness({ notify: () => null });
    const response = await handleNotificationsCron(request(`Bearer ${SECRET}`), {
      ...deps,
      healthcheckUrl: undefined,
    });
    expect(response.status).toBe(503);
  });
});

describe("the schedule", () => {
  const WEB = resolve(fileURLToPath(import.meta.url), "../../..");
  const config = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };

  it("apps/web/vercel.json runs /api/cron/notifications once a day at 06:00 UTC", () => {
    const entries = config.crons?.filter((cron) => cron.path === "/api/cron/notifications") ?? [];
    expect(entries).toEqual([{ path: "/api/cron/notifications", schedule: "0 6 * * *" }]);
  });

  it("a route file exists for every scheduled path", () => {
    for (const cron of config.crons ?? []) {
      const route = join(WEB, "src/app", cron.path, "route.ts");
      expect(() => readFileSync(route, "utf8")).not.toThrow();
    }
  });
});
