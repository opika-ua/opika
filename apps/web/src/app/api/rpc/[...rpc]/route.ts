import { RPCHandler } from "@orpc/server/fetch";
import { clientIp } from "../../../../api/client-ip";
import type { AppContext } from "../../../../api/context";
import { getDb } from "../../../../api/db";
import { apiRateLimiter } from "../../../../api/rate-limit";
import { ipRateLimitKey } from "../../../../api/rate-limit-key";
import { router } from "../../../../api/router";
import { validateSession } from "../../../../api/session/index";

const handler = new RPCHandler(router);

/**
 * The one procedure the pre-launch gate (`proxy.ts`) doesn't cover, since
 * it's built to carry no cookie at all (S8-D1). oRPC's own codec happily
 * decodes a GET's input from a `?data=` query string instead of the body
 * (`StandardRPCCodec.decode`, in `@orpc/server`, reads `request.method`
 * itself - it never checks against the procedure's declared method, so the
 * contract carries no server-side enforcement of this on its own) - which
 * would put exactly the ids this endpoint's own "never logged" promise
 * exists to protect into every access log, `Referer` header and browser
 * history entry that method produces. Checked before the request reaches
 * the rate limiter or the RPC dispatcher, so a wrong-method request never
 * spends shared per-IP budget and never has its input parsed at all.
 */
const CARDS_BY_IDS_PATH = "/api/rpc/animals/cardsByIds";

async function handleRequest(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  // Checked before anything else touches the database or the rate
  // limiter's shared budget: a wrong-method request to this one path
  // costs nothing and never has its input parsed at all.
  if (pathname === CARDS_BY_IDS_PATH && request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const now = new Date();

  // Per-IP rate limit - Upstash-backed in production, in-memory otherwise
  // (see rate-limit.ts). Keyed on an HMAC of the IP, never the IP (EM-Q11).
  if (!(await apiRateLimiter.check(ipRateLimitKey(clientIp(request)), now))) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const db = getDb();

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
  // intermediate layer - its answer depends on moderation state that can
  // change between two requests for the same ids. Scoped to this one
  // procedure's path rather than every procedure this route serves, since
  // nothing asked for the others' caching behaviour to change.
  if (pathname === CARDS_BY_IDS_PATH) {
    result.response.headers.set("Cache-Control", "no-store");
  }

  return result.response;
}

export const GET = handleRequest;
export const POST = handleRequest;
