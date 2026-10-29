import { KABINET_MAX_BODY_BYTES } from "@opika/contracts";
import { describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { rpcRequestInit } from "../api/test-harness";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";
import {
  handleKabinetRpc,
  KABINET_ANONYMOUS_PATHS,
  KABINET_UNVERIFIED_MAX_BODY_BYTES,
} from "./rpc-route";
import { TEST_SESSION_COOKIE } from "./test-session-cookie";

/**
 * Audit F9, the owner's S3 scope (2026-10-29): a caller no session has vouched for is read at
 * most 16 KB. The invitation link (exempt from the cookie 401) always; any other call with a
 * session cookie until that cookie has been looked up: past 16 KB the lookup runs before reading
 * on, a failed one is the 401 a missing cookie gets, and only a real session reads on to the
 * 4 MB ceiling. The count runs on every body, so a missing or lying Content-Length changes
 * nothing. Literals, not the constants, so a changed cap fails here.
 */
const KB = 1024;
const CHUNK = 4 * KB;
const BASE = "https://opika.example";
const PROFILE = `${BASE}/api/kabinet/shelter/profile/get`;
const INVITE = `${BASE}/api/kabinet/invitation/acceptWithPassword`;
const LOOKUP = "reached the session lookup";
const PAST_BODY = "read the body and went on, past the per-user limit";

type Lookup = "throws" | "fails" | "signed_in" | KabinetPrincipal["kind"];

/** What the lookup finds for each signed-in principal kind; `signed_in` is a shelter admin. */
const PRINCIPALS: Record<Exclude<KabinetPrincipal["kind"], "anonymous">, KabinetPrincipal> = {
  shelter_admin: {
    kind: "shelter_admin",
    shelterAdminId: "u-1" as never,
    shelterId: "s-1" as never,
  },
  super_admin: { kind: "super_admin", moderatorId: "u-1" as never },
  support_view: { kind: "support_view", moderatorId: "u-1" as never, shelterId: "s-1" as never },
  no_role: { kind: "no_role" },
  conflicting_roles: { kind: "conflicting_roles" },
};

function deps(lookup: Lookup) {
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
        if (lookup === "throws") throw new Error(LOOKUP);
        if (lookup === "fails" || lookup === "anonymous") {
          return { principal: { kind: "anonymous" }, userId: null, db: {}, cursorSecret: "x" };
        }
        const kind = lookup === "signed_in" ? "shelter_admin" : lookup;
        // A real Better Auth session in every case below: a user id, whatever the role.
        return { principal: PRINCIPALS[kind], userId: "u-1", db: {}, cursorSecret: "x" };
      },
      limiters: {
        perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
        // The first thing after the body and the lookup: reaching it means the body was accepted.
        perUser: {
          check: async () => {
            throw new Error(PAST_BODY);
          },
        },
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

/** A body of `totalBytes`, pulled 4 KB at a time only when asked, counting what was pulled. */
function meteredBody(totalBytes: number) {
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (pulled >= totalBytes) {
          controller.close();
          return;
        }
        const size = Math.min(CHUNK, totalBytes - pulled);
        pulled += size;
        controller.enqueue(new Uint8Array(size));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulled: () => pulled, cancelled: () => cancelled };
}

function post(url: string, headers: Record<string, string>, body: ReadableStream<Uint8Array>) {
  const request = new Request(url, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  } as RequestInit);
  // Precondition: a declared length, honest or not, reaches the route as sent.
  expect(request.headers.get("content-length")).toBe(headers["content-length"] ?? null);
  return request;
}

describe("the 16 KB cap for unverified callers", () => {
  it("is 16 KB, and below the 4 MB a signed-in caller gets", () => {
    expect(KABINET_UNVERIFIED_MAX_BODY_BYTES).toBe(16 * KB);
    expect(KABINET_MAX_BODY_BYTES).toBe(4 * KB * KB);
  });

  it("holds the largest invitation input the contract accepts, every character escaped", async () => {
    expect([...KABINET_ANONYMOUS_PATHS]).toEqual(["/api/kabinet/invitation/acceptWithPassword"]);
    // \u0001 is written as six bytes in JSON: the most any one UTF-16 unit costs.
    const largest = rpcRequestInit({
      token: "\u0001".repeat(256),
      password: "\u0001".repeat(1024),
    });
    const bytes = new TextEncoder().encode(String(largest.body)).byteLength;
    expect(bytes).toBeGreaterThan(7 * KB);
    expect(bytes).toBeLessThan(16 * KB);
  });
});

describe("the invitation link: 16 KB, always", () => {
  it("a declared Content-Length over 16 KB: 413, nothing read, no lookup", async () => {
    const { deps: d, resolvedCount } = deps("throws");
    const body = meteredBody(16 * KB + 1);
    const response = await handleKabinetRpc(
      post(INVITE, { "content-length": String(16 * KB + 1) }, body.stream),
      d,
    );
    expect(response.status).toBe(413);
    expect(body.pulled()).toBe(0);
    expect(resolvedCount()).toBe(0);
  });

  it.each([
    ["no Content-Length (chunked)", {}],
    ["a lying Content-Length", { "content-length": "100" }],
    ["a session cookie too (the cap is the path's)", { cookie: TEST_SESSION_COOKIE }],
  ])("%s, one byte over: 413 once the count passes 16 KB, no lookup", async (_label, headers) => {
    const { deps: d, resolvedCount } = deps("throws");
    const body = meteredBody(64 * KB);
    const request = post(INVITE, headers, body.stream);
    const response = await handleKabinetRpc(request, d);
    expect(response.status).toBe(413);
    expect(body.pulled()).toBeLessThanOrEqual(16 * KB + CHUNK);
    expect(body.cancelled()).toBe(true);
    expect(resolvedCount()).toBe(0);
  });

  it("exactly 16 KB is read and goes on to the lookup", async () => {
    const { deps: d, resolvedCount } = deps("throws");
    const body = meteredBody(16 * KB);
    await expect(handleKabinetRpc(post(INVITE, {}, body.stream), d)).rejects.toThrow(LOOKUP);
    expect(body.pulled()).toBe(16 * KB);
    expect(resolvedCount()).toBe(1);
  });
});

describe("any other call with a session cookie: past 16 KB, the lookup first", () => {
  it("16 KB or less: read whole, then the usual lookup, once", async () => {
    const { deps: d, resolvedCount } = deps("throws");
    const body = meteredBody(16 * KB);
    const request = post(PROFILE, { cookie: TEST_SESSION_COOKIE }, body.stream);
    await expect(handleKabinetRpc(request, d)).rejects.toThrow(LOOKUP);
    expect(body.pulled()).toBe(16 * KB);
    expect(resolvedCount()).toBe(1);
  });

  it("a declared Content-Length over 16 KB and a cookie that fails lookup: 401, nothing read", async () => {
    const { deps: d, resolvedCount } = deps("fails");
    const body = meteredBody(1024 * KB);
    const request = post(
      PROFILE,
      { cookie: TEST_SESSION_COOKIE, "content-length": String(1024 * KB) },
      body.stream,
    );
    const response = await handleKabinetRpc(request, d);
    expect(response.status).toBe(401);
    expect(body.pulled()).toBe(0);
    expect(resolvedCount()).toBe(1);
  });

  it.each([
    ["no Content-Length (chunked)", {}],
    ["a lying Content-Length", { "content-length": "1024" }],
  ])(
    "%s and a cookie that fails lookup: 401 after at most 16 KB, the rest never read",
    async (_label, headers) => {
      const { deps: d, resolvedCount } = deps("fails");
      const body = meteredBody(1024 * KB);
      const request = post(PROFILE, { cookie: TEST_SESSION_COOKIE, ...headers }, body.stream);
      const response = await handleKabinetRpc(request, d);
      expect(response.status).toBe(401);
      expect(body.pulled()).toBeLessThanOrEqual(16 * KB + CHUNK);
      expect(body.cancelled()).toBe(true);
      expect(resolvedCount()).toBe(1);
    },
  );

  it.each([
    ["no Content-Length (chunked)", {}],
    ["a lying Content-Length", { "content-length": "1024" }],
    ["a declared Content-Length", { "content-length": String(1024 * KB) }],
  ])(
    "%s and a real session: the whole 1 MB is read and goes on, looked up once",
    async (_label, headers) => {
      const { deps: d, resolvedCount } = deps("signed_in");
      const body = meteredBody(1024 * KB);
      const request = post(PROFILE, { cookie: TEST_SESSION_COOKIE, ...headers }, body.stream);
      await expect(handleKabinetRpc(request, d)).rejects.toThrow(PAST_BODY);
      expect(body.pulled()).toBe(1024 * KB);
      expect(resolvedCount()).toBe(1);
    },
  );

  it("a real session still stops at the 4 MB ceiling: 413 once the count passes it", async () => {
    const { deps: d, resolvedCount } = deps("signed_in");
    const body = meteredBody(KABINET_MAX_BODY_BYTES + 64 * KB);
    const request = post(PROFILE, { cookie: TEST_SESSION_COOKIE }, body.stream);
    const response = await handleKabinetRpc(request, d);
    expect(response.status).toBe(413);
    expect(body.pulled()).toBeLessThanOrEqual(KABINET_MAX_BODY_BYTES + CHUNK);
    expect(body.cancelled()).toBe(true);
    expect(resolvedCount()).toBe(1);
  });
});

/**
 * The owner's decision on #249: a real session with no role is held to 16 KB exactly like an
 * unauthenticated caller; only a role that legitimately needs more (the shelter admin's uploads,
 * the operator's unbounded registry texts) keeps 4 MB. A support view writes nothing, so it is
 * held too.
 */
describe("past 16 KB, only a role that needs it reads on", () => {
  it.each([["no_role"], ["conflicting_roles"], ["support_view"]] as const)(
    "a signed-in %s session: 401 after at most 16 KB, the rest never read",
    async (kind) => {
      const { deps: d, resolvedCount } = deps(kind);
      const body = meteredBody(1024 * KB);
      const request = post(PROFILE, { cookie: TEST_SESSION_COOKIE }, body.stream);
      const response = await handleKabinetRpc(request, d);
      expect(response.status).toBe(401);
      expect(body.pulled()).toBeLessThanOrEqual(16 * KB + CHUNK);
      expect(body.cancelled()).toBe(true);
      expect(resolvedCount()).toBe(1);
    },
  );

  it("a signed-in session with no role and a declared length over 16 KB: 401, nothing read", async () => {
    const { deps: d } = deps("no_role");
    const body = meteredBody(1024 * KB);
    const request = post(
      PROFILE,
      { cookie: TEST_SESSION_COOKIE, "content-length": String(1024 * KB) },
      body.stream,
    );
    expect((await handleKabinetRpc(request, d)).status).toBe(401);
    expect(body.pulled()).toBe(0);
  });

  it("a session with no role and 16 KB or less: read whole and goes on, as before", async () => {
    const { deps: d } = deps("no_role");
    const body = meteredBody(16 * KB);
    const request = post(PROFILE, { cookie: TEST_SESSION_COOKIE }, body.stream);
    await expect(handleKabinetRpc(request, d)).rejects.toThrow(PAST_BODY);
    expect(body.pulled()).toBe(16 * KB);
  });

  it.each([["shelter_admin"], ["super_admin"]] as const)(
    "a %s session keeps the ceiling: the whole 1 MB is read and goes on",
    async (kind) => {
      const { deps: d, resolvedCount } = deps(kind);
      const body = meteredBody(1024 * KB);
      const request = post(PROFILE, { cookie: TEST_SESSION_COOKIE }, body.stream);
      await expect(handleKabinetRpc(request, d)).rejects.toThrow(PAST_BODY);
      expect(body.pulled()).toBe(1024 * KB);
      expect(resolvedCount()).toBe(1);
    },
  );
});
