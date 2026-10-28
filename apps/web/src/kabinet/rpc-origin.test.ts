import { describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { SHELTER_WRITE_POLICY } from "./access";
import { handleKabinetRpc } from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * K-Q8 (Oleksii, 2026-10-15): `/api/kabinet` answers only calls from the
 * site's own pages, checked before any session is resolved. Read and write
 * alike: every oRPC call is a POST, and the reads carry the same session.
 */

const BASE = "https://opika.example";
const URL_PROFILE = `${BASE}/api/kabinet/shelter/profile/get`;

const deps = () => {
  let resolved = 0;
  return {
    resolvedCount: () => resolved,
    deps: {
      availability: {
        kind: "available" as const,
        sender: { send: async () => {} },
        invites: { send: async () => ({ kind: "sent" as const }) },
        secret: "x",
        baseURL: BASE,
      },
      resolve: async () => {
        resolved += 1;
        throw new Error("a refused call must never resolve a session");
      },
      limiters: {
        perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
        perUser: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
      },
      ip: "203.0.113.9",
      now: new Date(),
      newId: () => crypto.randomUUID(),
      operatorDisplayName: "Олексій",
      locationPolicy: null,
      production: true,
      shelterWrites: SHELTER_WRITE_POLICY,
    } as unknown as Parameters<typeof handleKabinetRpc>[1],
  };
};

const post = (headers: Record<string, string>) =>
  new Request(URL_PROFILE, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ json: {} }),
  });

describe("/api/kabinet refuses calls that don't come from the site (K-Q8)", () => {
  it.each([
    ["no Origin", {}],
    ["Origin: null", { origin: "null" }],
    ["another site", { origin: "https://evil.example" }],
    ["the same host over http", { origin: "http://opika.example" }],
    ["the same host on another port", { origin: "https://opika.example:8443" }],
    ["a subdomain", { origin: "https://kabinet.opika.example" }],
  ])("%s: 403, and no session is looked up", async (_label, headers) => {
    const { deps: d, resolvedCount } = deps();
    const response = await handleKabinetRpc(post(headers), d);
    expect(response.status).toBe(403);
    expect(resolvedCount()).toBe(0);
  });

  it("the site's own Origin goes through to the session lookup", async () => {
    const { deps: d, resolvedCount } = deps();
    await expect(
      handleKabinetRpc(post({ origin: BASE, cookie: TEST_SESSION_COOKIE }), d),
    ).rejects.toThrow("a refused call must never resolve a session");
    expect(resolvedCount()).toBe(1);
  });
});
