import { MAX_SAVED_CARDS_PER_REQUEST } from "@opika/contracts";
import type { Database } from "@opika/db";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { boundedBody } from "./bounded-body";
import type { AppContext } from "./context";
import type { PerIpBudgets } from "./per-ip-budgets";
import type { RateLimiter } from "./rate-limit";
import { ipRateLimitKey } from "./rate-limit-key";
import { retryAfterSecondsOf } from "./retry-after";
import { router } from "./router";
import { validateSession } from "./session/index";

export const PUBLIC_RPC_PREFIX = "/api/rpc";

/**
 * Audit F3: the largest legitimate public body is `animals.cardsByIds` with
 * 200 UUIDs, under 10 KB. The route refuses past this before parsing; the
 * plugin is the second line for any caller that reaches the handler directly.
 */
export const PUBLIC_RPC_MAX_BODY_BYTES = 64 * 1024;

export const publicRpcHandler = new RPCHandler(router, {
  plugins: [new BodyLimitPlugin({ maxBodySize: PUBLIC_RPC_MAX_BODY_BYTES })],
});

/**
 * Cookie-less and gate-exempt (S8-D1). POST only, checked before anything else:
 * oRPC's codec would decode a GET's `?data=`, putting the ids into access logs.
 */
export const CARDS_BY_IDS_PATH = `${PUBLIC_RPC_PREFIX}/animals/cardsByIds`;

const tooMany = (retryAfterSeconds: number) =>
  new Response("Too Many Requests", {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
const tooLarge = () => new Response("Payload Too Large", { status: 413 });

export type PublicRpcDeps = {
  /** Called only once the request is within every budget and ceiling. */
  db: () => Database;
  ip: string;
  now: Date;
  apiLimiter: RateLimiter;
  perIp: PerIpBudgets;
};

/** Everything `/api/rpc/*` does, as a function the tests call with a real `Request`. */
export async function handlePublicRpc(request: Request, deps: PublicRpcDeps): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === CARDS_BY_IDS_PATH && request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  // Keyed on an HMAC of the address's /64 or IPv4 (`ipKeyWith`), never the address (EM-Q11).
  const ipKey = ipRateLimitKey(deps.ip);
  if (!(await deps.apiLimiter.check(ipKey, deps.now))) {
    return tooMany(retryAfterSecondsOf(deps.apiLimiter, ipKey, deps.now));
  }

  const bounded = await boundedBody(request, PUBLIC_RPC_MAX_BODY_BYTES);
  if (bounded === "too_large") return tooLarge();

  if (pathname === CARDS_BY_IDS_PATH) {
    const refusal = await cardsByIdsPrecheck(bounded);
    if (refusal !== null) return refusal;
  }

  const db = deps.db();
  // Get-or-reject, never get-or-create.
  const session = await validateSession(db, bounded.headers.get("cookie"), deps.now);
  const setCookies: string[] = [];
  const context: AppContext = {
    db,
    adopterId: session.ok ? session.adopterId : null,
    tokenHash: session.ok ? session.tokenHash : null,
    now: deps.now,
    caller: { kind: "http", ipKey, budgets: deps.perIp },
    setCookies,
  };

  const result = await publicRpcHandler.handle(bounded, { prefix: PUBLIC_RPC_PREFIX, context });
  if (!result.matched) return new Response("Not Found", { status: 404 });
  for (const cookie of setCookies) result.response.headers.append("Set-Cookie", cookie);

  // DR1-Q2 (S8): its answer depends on moderation state, so no layer may cache it.
  if (pathname === CARDS_BY_IDS_PATH) result.response.headers.set("Cache-Control", "no-store");
  return result.response;
}

/**
 * Audit F3: zod validates every element before `.max()` and records an issue
 * per bad one, so an over-long `animalIds` is refused here by its length alone.
 * Reads the body exactly as oRPC's codec will (JSON when the content type is
 * JSON or absent); any other encoding could carry the array past this check,
 * so it is refused. The limit is the contract's own constant.
 */
async function cardsByIdsPrecheck(request: Request): Promise<Response | null> {
  const contentType = request.headers.get("content-type");
  const isJson = contentType === null || contentType.startsWith("application/json");
  if (!isJson || request.headers.has("content-disposition")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await request.clone().text());
  } catch {
    return null; // Not JSON: oRPC refuses it with its own 400.
  }
  const animalIds = inputOf(decoded)?.animalIds;
  if (Array.isArray(animalIds) && animalIds.length > MAX_SAVED_CARDS_PER_REQUEST) {
    return new Response("Bad Request", { status: 400 });
  }
  return null;
}

/** The procedure input inside oRPC's `{ json, meta }` wire envelope. */
function inputOf(body: unknown): { animalIds?: unknown } | null {
  if (typeof body !== "object" || body === null || !("json" in body)) return null;
  const { json } = body;
  return typeof json === "object" && json !== null ? json : null;
}
