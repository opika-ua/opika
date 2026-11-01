import type { Database } from "@opika/db";
import { os } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "./context";
import type { PerIpBudgets } from "./per-ip-budgets";
import { inMemoryRateLimiter } from "./rate-limit";

const lookup = vi.fn(async () => true);
const checkFor = vi.fn(
  (_headers: Headers, _now: Date) => lookup as (() => Promise<boolean>) | undefined,
);

vi.mock("./kabinet-session-check", () => ({ kabinetSessionCheckFor: checkFor }));
vi.mock("./session/index", () => ({ validateSession: async () => ({ ok: false }) }));
// The context the handlers receive, reported back: what this pins is what the route hands over.
vi.mock("./router", () => ({
  router: {
    ping: os
      .$context<AppContext>()
      .handler(({ context }) => ({ lookupIsInjected: context.isKabinetSession !== undefined })),
  },
}));

const { handlePublicRpc } = await import("./public-rpc-route");

const ALLOWS = { check: async () => true };
const deps = {
  db: () => ({}) as Database,
  ip: "203.0.113.9",
  now: new Date("2026-10-28T12:00:00Z"),
  apiLimiter: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
  perIp: { adopterMints: ALLOWS, newShelterReveals: ALLOWS } as PerIpBudgets,
};

const ping = (cookie: string) =>
  new Request("https://opika.example/api/rpc/ping", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ json: {} }),
  });

describe("/api/rpc hands the kabinet session lookup to the handlers", () => {
  it("puts the lookup on the context when the request carries the cookie", async () => {
    const response = await handlePublicRpc(ping("kabinet.session_token=x"), deps);
    expect(await response.json()).toEqual({ json: { lookupIsInjected: true } });
    expect(checkFor).toHaveBeenCalledTimes(1);
  });

  it("leaves it off the context when the helper finds no kabinet cookie", async () => {
    checkFor.mockReturnValueOnce(undefined);
    const response = await handlePublicRpc(ping("a=1"), deps);
    expect(await response.json()).toEqual({ json: { lookupIsInjected: false } });
  });
});
