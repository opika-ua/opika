import { KABINET_MAX_BODY_BYTES } from "@opika/contracts";
import { defaultConfig } from "next/dist/server/config-shared";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { inMemoryRateLimiter } from "../api/rate-limit";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetContext } from "./context";
import { PHOTO_UPLOADS_NOT_CONFIGURED } from "./photo-uploads";
import { handleKabinetRpc, KABINET_RPC_PREFIX, kabinetRpcHandler } from "./rpc-route";

/**
 * P-Q7: `/api/kabinet/*` reads at most `KABINET_MAX_BODY_BYTES`. A larger
 * body is 413 before any session is looked up, so an oversized upload costs
 * the server one bounded read and nothing else: no session, no database, no
 * sharp, no put.
 */

const BASE = "https://opika.example";
const ADD = `${BASE}/api/kabinet/shelter/photos/add`;
const SENTINEL = "reached the session lookup";

function deps() {
  let resolved = 0;
  const puts: string[] = [];
  return {
    resolvedCount: () => resolved,
    puts,
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
      photoUploads: {
        kind: "on" as const,
        storage: {
          async put(key: string) {
            puts.push(key);
          },
        },
        limiters: {
          perHour: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
          perDay: inMemoryRateLimiter({ windowMs: 60_000, maxRequests: 10_000 }),
        },
      },
    } as unknown as Parameters<typeof handleKabinetRpc>[1],
  };
}

const MiB = 1024 * 1024;

/** A body without a Content-Length, sent in 1 MiB chunks: how a chunked upload arrives. */
function chunked(totalBytes: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(MiB, totalBytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size));
    },
  });
}

describe("the kabinet body ceiling (P-Q7)", () => {
  it("a declared Content-Length over the ceiling: 413, no session, nothing stored", async () => {
    const { deps: d, resolvedCount, puts } = deps();
    const request = new Request(ADD, {
      method: "POST",
      headers: {
        origin: BASE,
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(KABINET_MAX_BODY_BYTES + 1),
      },
      body: "--x--",
    });
    const response = await handleKabinetRpc(request, d);
    expect(response.status).toBe(413);
    expect(resolvedCount()).toBe(0);
    expect(puts).toEqual([]);
  });

  it("a chunked body (no Content-Length) over the ceiling: 413, no session, nothing stored", async () => {
    const { deps: d, resolvedCount, puts } = deps();
    const request = new Request(ADD, {
      method: "POST",
      headers: { origin: BASE, "content-type": "multipart/form-data; boundary=x" },
      body: chunked(5 * MiB),
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    const response = await handleKabinetRpc(request, d);
    expect(response.status).toBe(413);
    expect(resolvedCount()).toBe(0);
    expect(puts).toEqual([]);
  });

  it("a small declared Content-Length followed by a larger body: 413, no session, nothing stored", async () => {
    const { deps: d, resolvedCount, puts } = deps();
    const request = new Request(ADD, {
      method: "POST",
      headers: {
        origin: BASE,
        "content-type": "multipart/form-data; boundary=x",
        "content-length": "1024",
      },
      body: chunked(KABINET_MAX_BODY_BYTES + MiB),
      duplex: "half",
    } as RequestInit);
    // Precondition: the lie reaches the route, so the 413 below is the count's.
    expect(request.headers.get("content-length")).toBe("1024");
    const response = await handleKabinetRpc(request, d);
    expect(response.status).toBe(413);
    expect(resolvedCount()).toBe(0);
    expect(puts).toEqual([]);
  });

  it("one byte over, counted while reading: 413", async () => {
    const { deps: d, resolvedCount } = deps();
    const request = new Request(ADD, {
      method: "POST",
      headers: { origin: BASE },
      body: chunked(KABINET_MAX_BODY_BYTES + 1),
      duplex: "half",
    } as RequestInit);
    expect((await handleKabinetRpc(request, d)).status).toBe(413);
    expect(resolvedCount()).toBe(0);
  });

  it("exactly the ceiling goes on to the session lookup (the 413s above are about size)", async () => {
    const { deps: d, resolvedCount } = deps();
    const request = new Request(ADD, {
      method: "POST",
      headers: { origin: BASE },
      body: chunked(KABINET_MAX_BODY_BYTES),
      duplex: "half",
    } as RequestInit);
    await expect(handleKabinetRpc(request, d)).rejects.toThrow(SENTINEL);
    expect(resolvedCount()).toBe(1);
  });

  it("the oRPC handler holds the same ceiling on its own (BodyLimitPlugin)", async () => {
    const request = new Request(ADD, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: chunked(KABINET_MAX_BODY_BYTES + 1),
      duplex: "half",
    } as RequestInit);
    const result = await kabinetRpcHandler.handle(request, {
      prefix: KABINET_RPC_PREFIX,
      context: {
        principal: { kind: "anonymous" },
        shelterWrites: SHELTER_WRITE_POLICY,
        photoUploads: PHOTO_UPLOADS_NOT_CONFIGURED,
      } as unknown as KabinetContext,
    });
    expect(result.matched).toBe(true);
    expect(result.response?.status).toBe(413);
  });

  /**
   * Next's proxy buffers a request body up to `proxyClientMaxBodySize` and
   * passes on only that much: a ceiling at or above it would let a truncated
   * body through as if it were whole. Read from Next's own defaults, and the
   * config must not raise or lower it unnoticed.
   */
  it("sits below Next's proxy body buffer, which the config leaves at its default", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBeUndefined();
    expect(defaultConfig.experimental?.proxyClientMaxBodySize).toBe(10 * MiB);
    expect(KABINET_MAX_BODY_BYTES).toBeLessThan(
      defaultConfig.experimental?.proxyClientMaxBodySize ?? 0,
    );
  });
});
