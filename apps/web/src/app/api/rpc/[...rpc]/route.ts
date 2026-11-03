import { clientIp } from "../../../../api/client-ip";
import { getDb } from "../../../../api/db";
import { servedPerIpBudgets } from "../../../../api/per-ip-budgets";
import { handlePublicRpc } from "../../../../api/public-rpc-route";
import { apiRateLimiter } from "../../../../api/rate-limit";
import { servedSiteOrigin } from "../../../../api/site-origin";

// Every limiter here is Upstash-backed on Vercel, in-memory elsewhere (rate-limit.ts).
async function handleRequest(request: Request): Promise<Response> {
  return handlePublicRpc(request, {
    db: getDb,
    ip: clientIp(request),
    now: new Date(),
    apiLimiter: apiRateLimiter,
    perIp: servedPerIpBudgets(),
    siteOrigin: servedSiteOrigin(process.env, request),
  });
}

export const GET = handleRequest;
export const POST = handleRequest;
