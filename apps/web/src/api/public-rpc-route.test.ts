import { AnimalsCardsByIdsInputSchema } from "@opika/contracts";
import type { Database } from "@opika/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PerIpBudgets } from "./per-ip-budgets";
import { CARDS_BY_IDS_PATH, handlePublicRpc, PUBLIC_RPC_MAX_BODY_BYTES } from "./public-rpc-route";
import { inMemoryRateLimiter, type RateLimiter } from "./rate-limit";

/**
 * Audit F3: `/api/rpc` reads at most 64 KB and parses none of a larger body;
 * `animals.cardsByIds` refuses more than 200 ids by the array's length, before
 * zod looks at a single element.
 */
const BASE = "https://opika.example";
const SENTINEL = "reached the session lookup";
const KB = 1024;

const ALLOWS: RateLimiter = { check: async () => true };
const UNSPENT: PerIpBudgets = { adopterMints: ALLOWS, newShelterReveals: ALLOWS };

/** `db` throws unless told otherwise, so reaching the session lookup is visible. */
function deps(
  db: () => Database = () => {
    throw new Error(SENTINEL);
  },
) {
  let dbCalls = 0;
  return {
    dbCalls: () => dbCalls,
    deps: {
      db: () => {
        dbCalls += 1;
        return db();
      },
      ip: "203.0.113.9",
      now: new Date("2026-10-28T12:00:00Z"),
      apiLimiter: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
      perIp: UNSPENT,
    },
  };
}

/** A body with no Content-Length, in `chunkBytes` pieces: how a chunked request arrives. */
function chunked(totalBytes: number, chunkBytes = 16 * KB): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(0x20));
    },
  });
}

/** A one-chunk body that counts reads; a high-water mark of 0 means nothing is pulled unasked. */
function untouched() {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulls: () => pulls };
}

const post = (path: string, init: RequestInit & { duplex?: "half" }) =>
  new Request(`${BASE}${path}`, { method: "POST", ...init } as RequestInit);

const cardsByIds = (animalIds: unknown[], headers: Record<string, string> = {}) =>
  post(CARDS_BY_IDS_PATH, {
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ json: { animalIds } }),
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the /api/rpc body ceiling (audit F3)", () => {
  it("is 64 KB", () => {
    expect(PUBLIC_RPC_MAX_BODY_BYTES).toBe(64 * 1024);
  });

  it("a declared Content-Length over the ceiling: 413 without reading a byte, no session lookup", async () => {
    const { deps: d, dbCalls } = deps();
    const body = untouched();
    const request = post("/api/rpc/cities/list", {
      headers: { "content-type": "application/json", "content-length": String(64 * KB + 1) },
      body: body.stream,
      duplex: "half",
    });
    const response = await handlePublicRpc(request, d);
    expect(response.status).toBe(413);
    expect(body.pulls()).toBe(0);
    expect(dbCalls()).toBe(0);
  });

  it("a chunked body (no Content-Length) over the ceiling: 413, no session lookup", async () => {
    const { deps: d, dbCalls } = deps();
    const request = post("/api/rpc/cities/list", {
      headers: { "content-type": "application/json" },
      body: chunked(80 * KB),
      duplex: "half",
    });
    expect(request.headers.get("content-length")).toBeNull();
    expect((await handlePublicRpc(request, d)).status).toBe(413);
    expect(dbCalls()).toBe(0);
  });

  it("a small declared Content-Length followed by a larger body: 413, counted while reading", async () => {
    const { deps: d, dbCalls } = deps();
    const request = post("/api/rpc/cities/list", {
      headers: { "content-type": "application/json", "content-length": "16" },
      body: chunked(64 * KB + 1),
      duplex: "half",
    });
    // Precondition: the lie reaches the route, so the 413 below is the count's.
    expect(request.headers.get("content-length")).toBe("16");
    expect((await handlePublicRpc(request, d)).status).toBe(413);
    expect(dbCalls()).toBe(0);
  });

  it("a body of exactly 64 KB is not refused for its size", async () => {
    const { deps: d, dbCalls } = deps();
    const envelope = '{"json":{}}';
    const body = envelope + " ".repeat(64 * KB - envelope.length);
    expect(new TextEncoder().encode(body).byteLength).toBe(64 * KB);
    const request = post("/api/rpc/cities/list", {
      headers: { "content-type": "application/json" },
      body,
    });
    await expect(handlePublicRpc(request, d)).rejects.toThrow(SENTINEL);
    expect(dbCalls()).toBe(1);
  });

  it("the per-IP limiter still refuses first, before any body is read", async () => {
    const { deps: d, dbCalls } = deps();
    const body = untouched();
    const request = post("/api/rpc/cities/list", { body: body.stream, duplex: "half" });
    const refused = { ...d, apiLimiter: { check: async () => false } };
    const response = await handlePublicRpc(request, refused);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(body.pulls()).toBe(0);
    expect(dbCalls()).toBe(0);
  });

  it("a refusal's Retry-After comes from the limiter's own state", async () => {
    const { deps: d } = deps();
    const limiter = {
      check: async () => false,
      retryAfterSeconds: () => 17.2,
    };
    const request = post("/api/rpc/cities/list", { body: "{}" });
    const response = await handlePublicRpc(request, { ...d, apiLimiter: limiter });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("18");
  });
});

describe("animals.cardsByIds: more than 200 ids, refused by length alone (audit F3)", () => {
  /** oRPC validates input through the contract schema's Standard Schema entry point. */
  const spyOnValidation = () => vi.spyOn(AnimalsCardsByIdsInputSchema["~standard"], "validate");

  it("201 elements: 400 before the contract schema runs, no session lookup", async () => {
    const validate = spyOnValidation();
    const { deps: d, dbCalls } = deps();
    const response = await handlePublicRpc(cardsByIds(new Array(201).fill(1)), d);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
    expect(validate).not.toHaveBeenCalled();
    expect(dbCalls()).toBe(0);
  });

  it("10,000 elements, the audit's shape, under the body ceiling: the same, with no per-element issues", async () => {
    const validate = spyOnValidation();
    const { deps: d } = deps();
    const request = cardsByIds(new Array(10_000).fill(1));
    const response = await handlePublicRpc(request, d);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
    expect(validate).not.toHaveBeenCalled();
  });

  it("200 elements pass the length check and reach the contract schema (the control)", async () => {
    const validate = spyOnValidation();
    // No cookie, so the session lookup returns before touching the database.
    const { deps: d } = deps(() => ({}) as Database);
    const response = await handlePublicRpc(cardsByIds(new Array(200).fill(1)), d);
    expect(validate).toHaveBeenCalledTimes(1);
    // oRPC's own refusal of 200 invalid ids, not the route's.
    expect(response.status).toBe(400);
    expect(await response.text()).not.toBe("Bad Request");
  });

  it("an encoding the length check can't read (multipart) is refused: 415", async () => {
    const validate = spyOnValidation();
    const { deps: d, dbCalls } = deps();
    const form = new FormData();
    form.set("data", JSON.stringify({ json: { animalIds: new Array(201).fill(1) } }));
    const response = await handlePublicRpc(post(CARDS_BY_IDS_PATH, { body: form }), d);
    expect(response.status).toBe(415);
    expect(validate).not.toHaveBeenCalled();
    expect(dbCalls()).toBe(0);
  });

  it("a body with no content type is read as JSON, as oRPC reads it, and checked the same way", async () => {
    const validate = spyOnValidation();
    const { deps: d } = deps();
    const request = post(CARDS_BY_IDS_PATH, {
      body: new Blob([JSON.stringify({ json: { animalIds: new Array(201).fill(1) } })]),
    });
    expect(request.headers.get("content-type")).toBeNull();
    const response = await handlePublicRpc(request, d);
    expect(response.status).toBe(400);
    expect(validate).not.toHaveBeenCalled();
  });

  it("still answers a GET with 405, before anything else", async () => {
    const { deps: d, dbCalls } = deps();
    const response = await handlePublicRpc(new Request(`${BASE}${CARDS_BY_IDS_PATH}`), d);
    expect(response.status).toBe(405);
    expect(dbCalls()).toBe(0);
  });
});
