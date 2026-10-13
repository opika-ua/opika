import { clientIp } from "../../../../api/client-ip";
import { getDb } from "../../../../api/db";
import { requireEnv } from "../../../../api/env";
import { kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { operatorDisplayName } from "../../../../kabinet/operator";
import { kabinetIdentityOf } from "../../../../kabinet/principal";
import { handleKabinetRpc } from "../../../../kabinet/rpc-route";
import { kabinetAuth, kabinetLimiters } from "../../../../kabinet/runtime";

async function handle(request: Request): Promise<Response> {
  const now = new Date();
  return handleKabinetRpc(request, {
    availability: kabinetAuthAvailability(process.env),
    resolve: async () => ({
      ...(await kabinetIdentityOf(kabinetAuth(), getDb(), request.headers, now)),
      db: getDb(),
      cursorSecret: requireEnv("CURSOR_HMAC_SECRET"),
    }),
    limiters: kabinetLimiters,
    ip: clientIp(request),
    now,
    newId: () => crypto.randomUUID(),
    operatorDisplayName: operatorDisplayName({
      KABINET_OPERATOR_DISPLAY_NAME: process.env.KABINET_OPERATOR_DISPLAY_NAME,
    }),
  });
}

export const GET = handle;
export const POST = handle;
