import { RPCHandler } from "@orpc/server/fetch";
import { clientIp } from "../../../../api/client-ip";
import type { AppContext } from "../../../../api/context";
import { getDb } from "../../../../api/db";
import { apiRateLimiter } from "../../../../api/rate-limit";
import { ipRateLimitKey } from "../../../../api/rate-limit-key";
import { router } from "../../../../api/router";
import { validateSession } from "../../../../api/session/index";

const handler = new RPCHandler(router);

async function handleRequest(request: Request): Promise<Response> {
  const db = getDb();
  const now = new Date();

  // Per-IP rate limit — Upstash-backed in production, in-memory otherwise
  // (see rate-limit.ts). Keyed on an HMAC of the IP, never the IP (EM-Q11).
  if (!(await apiRateLimiter.check(ipRateLimitKey(clientIp(request)), now))) {
    return new Response("Too Many Requests", { status: 429 });
  }

  // Validate session from cookie (get-or-reject, never get-or-create)
  const session = await validateSession(db, request.headers.get("cookie"), now);

  const setCookies: string[] = [];
  const context: AppContext = {
    db,
    adopterId: session.ok ? session.adopterId : null,
    tokenHash: session.ok ? session.tokenHash : null,
    now,
    setCookies,
  };

  const result = await handler.handle(request, {
    prefix: "/api/rpc",
    context,
  });

  if (!result.matched) {
    return new Response("Not Found", { status: 404 });
  }

  // Attach any Set-Cookie headers accumulated during the request
  for (const cookie of setCookies) {
    result.response.headers.append("Set-Cookie", cookie);
  }

  // DR1-Q2 (S8): the saved page's batch read is never cached by an
  // intermediate layer — its answer depends on moderation state that can
  // change between two requests for the same ids. Scoped to this one
  // procedure's path rather than every procedure this route serves, since
  // nothing asked for the others' caching behaviour to change.
  if (new URL(request.url).pathname === "/api/rpc/animals/cardsByIds") {
    result.response.headers.set("Cache-Control", "no-store");
  }

  return result.response;
}

export const GET = handleRequest;
export const POST = handleRequest;
