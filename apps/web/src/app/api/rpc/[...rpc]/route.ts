import { createDatabase } from "@opika/db";
import { RPCHandler } from "@orpc/server/fetch";
import type { AppContext } from "../../../../api/context.js";
import { requireEnv } from "../../../../api/env.js";
import { apiRateLimiter } from "../../../../api/rate-limit.js";
import { router } from "../../../../api/router.js";
import { validateSession } from "../../../../api/session/index.js";

const handler = new RPCHandler(router);

const db = createDatabase(requireEnv("DATABASE_URL"));

async function handleRequest(request: Request): Promise<Response> {
  const now = new Date();

  // Per-IP rate limit (in-memory, per-instance — see rate-limit.ts)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!apiRateLimiter.check(ip, now)) {
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

  return result.response;
}

export const GET = handleRequest;
export const POST = handleRequest;
