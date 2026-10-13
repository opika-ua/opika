import { clientIp } from "../../../../api/client-ip";
import { getDb } from "../../../../api/db";
import { requireEnv } from "../../../../api/env";
import { apiRateLimiter } from "../../../../api/rate-limit";
import { kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { principalOf } from "../../../../kabinet/principal";
import { handleKabinetRpc } from "../../../../kabinet/rpc-route";
import { kabinetAuth } from "../../../../kabinet/runtime";

async function handle(request: Request): Promise<Response> {
  const now = new Date();
  if (!(await apiRateLimiter.check(clientIp(request), now))) {
    return new Response("Too Many Requests", { status: 429 });
  }
  return handleKabinetRpc(request, {
    availability: kabinetAuthAvailability(process.env),
    resolve: async () => ({
      principal: await principalOf(kabinetAuth(), getDb(), request.headers, now),
      db: getDb(),
      cursorSecret: requireEnv("CURSOR_HMAC_SECRET"),
    }),
    now,
    newId: () => crypto.randomUUID(),
  });
}

export const GET = handle;
export const POST = handle;
