import { PASSWORD_MAX_CHARACTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { inMemoryRateLimiter } from "../api/rate-limit";
import type { KabinetAuth } from "./auth";
import { AUTH_MAX_BODY_BYTES, handleKabinetAuth, type KabinetAuthAvailability } from "./auth-route";

/**
 * `/api/auth` reads a body before anyone is signed in, and since #360 it is outside the proxy, so
 * the route's own 16 KB bound is the only one. Literal sizes, not the constant, so a raised cap
 * fails here. Better Auth is a stand-in that records what reaches it.
 */
const KB = 1024;
const BASE = "https://opika.example";
const available = {
  kind: "available",
  sender: { send: async () => {} },
  invites: { send: async () => ({ kind: "sent" as const }) },
  passwordMail: { sendReset: async () => {}, sendChanged: async () => {} },
  secret: "x",
  baseURL: BASE,
} as unknown as KabinetAuthAvailability;

function harness() {
  const reached: string[] = [];
  const auth = {
    handler: async (request: Request) => {
      reached.push(await request.text());
      return Response.json({ ok: true });
    },
  } as unknown as KabinetAuth;
  const deps = () => ({
    availability: available,
    auth: () => auth,
    limiters: {
      perAddress: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 }),
      perIp: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 100 }),
    },
    now: new Date("2026-11-02T10:00:00Z"),
  });
  return { reached, deps };
}

const post = (path: string, body: string) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body,
  });

/** A chunked body (no Content-Length) of `chunks` pieces of `size` bytes; `pulled` counts those read. */
function chunked(path: string, chunks: number, size: number, extra: Record<string, string> = {}) {
  const state = { pulled: 0 };
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === chunks) return controller.close();
      sent += 1;
      state.pulled += 1;
      controller.enqueue(new Uint8Array(size).fill(0x20));
    },
  });
  const request = new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...extra },
    body,
    duplex: "half",
  } as RequestInit);
  return { request, state };
}

describe("/api/auth body cap", () => {
  it("is 16 KB", () => {
    expect(AUTH_MAX_BODY_BYTES).toBe(16 * KB);
  });

  it.each([
    "/api/auth/sign-in/magic-link",
    "/api/auth/sign-in/email",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
    "/api/auth/change-password",
    "/api/auth/sign-out",
  ])("answers 413 to a declared length over the cap on %s, before any parse", async (path) => {
    const { reached, deps } = harness();
    // Valid JSON, so only the cap can be what refuses it.
    const body = JSON.stringify({ email: "a@example.org", pad: "x".repeat(16 * KB) });
    const response = await handleKabinetAuth(post(path, body), deps());
    expect(response.status).toBe(413);
    expect(reached).toEqual([]);
  });

  it("cuts off a chunked body at the cap plus one chunk and answers 413", async () => {
    const { reached, deps } = harness();
    // 100 MB on offer in 4 KB chunks; the stream must not be drained.
    const { request, state } = chunked("/api/auth/sign-in/magic-link", 25_000, 4 * KB);
    const response = await handleKabinetAuth(request, deps());
    expect(response.status).toBe(413);
    expect(reached).toEqual([]);
    // 16 KB is four chunks; the fifth crosses it, the sixth is the stream's own read-ahead.
    expect(state.pulled).toBeLessThanOrEqual(6);
  });

  it("does not trust a Content-Length that claims less than is sent", async () => {
    const { reached, deps } = harness();
    const { request } = chunked("/api/auth/sign-in/email", 8, 4 * KB, { "content-length": "10" });
    const response = await handleKabinetAuth(request, deps());
    expect(response.status).toBe(413);
    expect(reached).toEqual([]);
  });

  it("still forwards a normal sign-in request, normalised; the allowlist still comes first", async () => {
    const { reached, deps } = harness();
    const ok = await handleKabinetAuth(
      post(
        "/api/auth/sign-in/magic-link",
        JSON.stringify({ email: " Olena@Example.ORG ", callbackURL: "/kabinet" }),
      ),
      deps(),
    );
    expect(ok.status).toBe(200);
    expect(JSON.parse(reached[0] ?? "{}")).toMatchObject({ email: "olena@example.org" });
    const unlisted = post("/api/auth/not-forwarded", "x".repeat(32 * KB));
    expect((await handleKabinetAuth(unlisted, deps())).status).toBe(404);
  });

  it("forwards a body of exactly 16 KB", async () => {
    const { reached, deps } = harness();
    const shell = JSON.stringify({ pad: "" }).length;
    const exact = JSON.stringify({ pad: "x".repeat(16 * KB - shell) });
    expect(new TextEncoder().encode(exact).byteLength).toBe(16 * KB);
    const response = await handleKabinetAuth(post("/api/auth/reset-password", exact), deps());
    expect(response.status).toBe(200);
    expect(reached).toHaveLength(1);
  });

  it("passes GET requests (get-session) through without a body read", async () => {
    const { reached, deps } = harness();
    const response = await handleKabinetAuth(new Request(`${BASE}/api/auth/get-session`), deps());
    expect(response.status).toBe(200);
    expect(reached).toEqual([""]);
  });
});

/**
 * Every body Better Auth's forwarded endpoints (`FORWARDED_AUTH_PATHS`) take, at the largest the
 * app's own limits allow. `/api/auth/magic-link/verify` is not forwarded (the confirm page reaches
 * it server-side) and the invitation's password step is under `/api/kabinet`, so neither is here;
 * email change and sign-up are not enabled. JSON-escaping is the worst case: a password of
 * astral characters can be sent as `\uXXXX\uXXXX`, 12 bytes for 4 bytes of text. The sizes are
 * measured on the actual JSON the client would send.
 */
describe("the real bodies stay well under the cap", () => {
  const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
  // The emoji as `😀` escapes: the largest encoding of 128 characters.
  const password = "\\ud83d\\ude00".repeat(PASSWORD_MAX_CHARACTERS);
  const token = "t".repeat(64);
  const callbackURL = "/kabinet/prytulky/00000000-0000-0000-0000-000000000000";
  const json = (fields: Record<string, string | boolean>) =>
    JSON.stringify(fields).replaceAll("\\\\u", "\\u");

  const bodies: Record<string, Record<string, string | boolean>> = {
    "sign-in/magic-link": { email, callbackURL },
    "sign-in/email": { email, password },
    "request-password-reset": { email },
    "reset-password": { token, newPassword: password },
    "change-password": {
      currentPassword: password,
      newPassword: password,
      revokeOtherSessions: true,
    },
    "sign-out": {},
  };

  it("keeps the address at 254 characters", () => {
    expect(email.length).toBe(254);
  });

  // Measured sizes, pinned so the PR's numbers stay true; each is a quarter of the cap or less.
  it.each([
    ["sign-in/magic-link", 337],
    ["sign-in/email", 1816],
    ["request-password-reset", 266],
    ["reset-password", 1629],
    ["change-password", 3138],
    ["sign-out", 2],
  ] as const)("%s is %i bytes", (name, expected) => {
    const bytes = new TextEncoder().encode(json(bodies[name] ?? {})).byteLength;
    expect(bytes).toBe(expected);
    expect(bytes).toBeLessThan(4 * KB);
  });
});
