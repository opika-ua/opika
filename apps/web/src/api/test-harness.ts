import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { RPCHandler } from "@orpc/server/fetch";
import type { AppContext } from "./context.js";
import { router } from "./router.js";
import { validateSession } from "./session/index.js";

const CURSOR_HMAC_SECRET = "test-hmac-secret-for-cursor-signing";

/**
 * oRPC date type tag used in the meta array for serialization.
 * See StandardRPCJsonSerializer in @orpc/client.
 */
const ORPC_DATE_TYPE = 1;

/**
 * Serialize a value into oRPC's standard RPC wire format.
 *
 * oRPC wraps JSON payloads as `{ json, meta }` where `meta` carries type
 * annotations for values JSON cannot represent natively (Date, BigInt, etc).
 * We only need Date support for the test harness.
 */
function toRpcBody(data: unknown): unknown {
  const meta: unknown[][] = [];

  function walk(value: unknown, path: (string | number)[]): unknown {
    if (value instanceof Date) {
      meta.push([ORPC_DATE_TYPE, ...path]);
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((v, i) => walk(v, [...path, i]));
    }
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = walk(v, [...path, k]);
      }
      return result;
    }
    return value;
  }

  const json = walk(data, []);
  return meta.length > 0 ? { json, meta } : { json };
}

/**
 * Deserialize oRPC's standard RPC wire format back to plain JS.
 */
function fromRpcBody(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (!("json" in obj)) return raw;

  const data = structuredClone(obj.json);
  const meta = (obj.meta ?? []) as unknown[][];

  for (const entry of meta) {
    const type = entry[0] as number;
    const path = entry.slice(1) as (string | number)[];

    let current: Record<string, unknown> = { data };
    let lastKey: string | number = "data";
    for (const segment of path) {
      current = current[lastKey] as Record<string, unknown>;
      lastKey = segment;
    }

    if (type === ORPC_DATE_TYPE) {
      current[lastKey] = new Date(current[lastKey] as string);
    }
  }

  return (data as unknown) ?? data;
}

/**
 * Test harness for the oRPC router.
 *
 * Exercises the full handler stack (contract validation, handler logic,
 * output stripping) against a real Postgres database.
 *
 * Call `createTestHarness()` in `beforeAll`, then `harness.truncate()` in
 * `beforeEach` for TRUNCATE isolation between tests.
 */
export async function createTestHarness() {
  // Set the env var the handlers read
  process.env.CURSOR_HMAC_SECRET = CURSOR_HMAC_SECRET;

  const { db, cleanup } = await setupTestDatabase();
  const handler = new RPCHandler(router);

  async function call(
    path: string,
    body: unknown,
    opts: { cookie?: string; now?: Date } = {},
  ): Promise<{ status: number; body: unknown; headers: Headers }> {
    const now = opts.now ?? new Date("2026-08-01T12:00:00Z");

    // Validate session from cookie, same as the real route handler
    const session = await validateSession(db, opts.cookie ?? null, now);

    const setCookies: string[] = [];
    const context: AppContext = {
      db,
      adopterId: session.ok ? session.adopterId : null,
      tokenHash: session.ok ? session.tokenHash : null,
      now,
      setCookies,
    };

    const urlPath = path.replace(/\./g, "/");
    const rpcBody = toRpcBody(body);
    const request = new Request(`http://localhost/api/rpc/${urlPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      },
      body: JSON.stringify(rpcBody),
    });

    const result = await handler.handle(request, {
      prefix: "/api/rpc",
      context,
    });

    if (!result.matched) {
      return { status: 404, body: null, headers: new Headers() };
    }

    for (const cookie of setCookies) {
      result.response.headers.append("Set-Cookie", cookie);
    }

    const text = await result.response.text();
    let responseBody: unknown;
    try {
      responseBody = fromRpcBody(JSON.parse(text));
    } catch {
      responseBody = text;
    }
    return {
      status: result.response.status,
      body: responseBody,
      headers: result.response.headers,
    };
  }

  /**
   * Extract the session cookie value from a Set-Cookie header.
   * Returns a Cookie header string suitable for replay.
   */
  function extractSessionCookie(headers: Headers): string | null {
    const setCookie = headers.get("set-cookie");
    if (!setCookie) return null;
    // Parse "session=<token>; HttpOnly; ..." → "session=<token>"
    const match = setCookie.match(/^((?:__Host-)?session=[^;]+)/);
    return match?.[1] ?? null;
  }

  return {
    db,
    call,
    extractSessionCookie,
    cursorSecret: CURSOR_HMAC_SECRET,
    async truncate() {
      await truncateAll(db as Parameters<typeof truncateAll>[0]);
    },
    async cleanup() {
      delete process.env.CURSOR_HMAC_SECRET;
      await cleanup();
    },
  };
}

export type TestHarness = Awaited<ReturnType<typeof createTestHarness>>;
