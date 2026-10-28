import { KABINET_MAX_BODY_BYTES } from "@opika/contracts";
import { describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { SHELTER_WRITE_POLICY } from "./access";
import { handleKabinetRpc, KABINET_ANONYMOUS_PATHS } from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * Audit F9, the owner's decision (2026-10-28): after the declared-size check
 * and before the body is read, a request with no kabinet session cookie is 401
 * with no body read and no database. Presence only; the real session lookup
 * stays where it was. The invitation link (PW-2) has no session by design.
 */
const BASE = "https://opika.example";
const PROFILE = `${BASE}/api/kabinet/shelter/profile/get`;
const INVITE = `${BASE}/api/kabinet/invitation/acceptWithPassword`;
const SENTINEL = "reached the session lookup";

function deps() {
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
        throw new Error(SENTINEL);
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
}

/** A JSON body that counts reads; a high-water mark of 0 means nothing is pulled unasked. */
function countedBody() {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode('{"json":{}}'));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulls: () => pulls };
}

const post = (url: string, headers: Record<string, string>, body: ReadableStream<Uint8Array>) =>
  new Request(url, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  } as RequestInit);

describe("/api/kabinet without a session cookie (audit F9)", () => {
  it("no cookie at all: 401, no body read, no session lookup", async () => {
    const { deps: d, resolvedCount } = deps();
    const body = countedBody();
    const response = await handleKabinetRpc(post(PROFILE, {}, body.stream), d);
    expect(response.status).toBe(401);
    expect(body.pulls()).toBe(0);
    expect(resolvedCount()).toBe(0);
  });

  it.each([
    ["only other cookies", "theme=dark; __Host-session=abc"],
    ["the support cookie alone", "__Host-kabinet.support=abc"],
    ["the session cookie, empty", "__Host-kabinet.session_token="],
    ["a name that only contains it", "x__Host-kabinet.session_token=abc"],
  ])("%s: 401 the same way", async (_label, cookie) => {
    const { deps: d, resolvedCount } = deps();
    const body = countedBody();
    const response = await handleKabinetRpc(post(PROFILE, { cookie }, body.stream), d);
    expect(response.status).toBe(401);
    expect(body.pulls()).toBe(0);
    expect(resolvedCount()).toBe(0);
  });

  it("an oversized declared body is still 413 first, cookie or not", async () => {
    const { deps: d, resolvedCount } = deps();
    const body = countedBody();
    const response = await handleKabinetRpc(
      post(PROFILE, { "content-length": String(KABINET_MAX_BODY_BYTES + 1) }, body.stream),
      d,
    );
    expect(response.status).toBe(413);
    expect(body.pulls()).toBe(0);
    expect(resolvedCount()).toBe(0);
  });

  it.each([
    ["the production name", "theme=dark; __Host-kabinet.session_token=abc"],
    ["the plain-HTTP name", "kabinet.session_token=abc"],
    ["the shared test cookie", TEST_SESSION_COOKIE],
  ])(
    "with a session cookie (%s): read, then the existing session lookup",
    async (_label, cookie) => {
      const { deps: d, resolvedCount } = deps();
      const body = countedBody();
      await expect(handleKabinetRpc(post(PROFILE, { cookie }, body.stream), d)).rejects.toThrow(
        SENTINEL,
      );
      expect(body.pulls()).toBeGreaterThan(0);
      expect(resolvedCount()).toBe(1);
    },
  );

  it("the invitation link needs no session cookie: it goes on to the existing path", async () => {
    expect([...KABINET_ANONYMOUS_PATHS]).toEqual(["/api/kabinet/invitation/acceptWithPassword"]);
    const { deps: d, resolvedCount } = deps();
    const body = countedBody();
    await expect(handleKabinetRpc(post(INVITE, {}, body.stream), d)).rejects.toThrow(SENTINEL);
    expect(resolvedCount()).toBe(1);
  });
});
