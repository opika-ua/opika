import { productionLocationPolicy } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import { clientIp } from "../../../../api/client-ip";
import { getDb } from "../../../../api/db";
import { requireEnv } from "../../../../api/env";
import { SHELTER_WRITE_POLICY } from "../../../../kabinet/access";
import { kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { operatorDisplayName } from "../../../../kabinet/operator";
import { kabinetIdentityOf } from "../../../../kabinet/principal";
import { handleKabinetRpc } from "../../../../kabinet/rpc-route";
import { kabinetAuth, kabinetLimiters } from "../../../../kabinet/runtime";

/**
 * RG-Q10: the registry needs `LOCATION_HMAC_SECRET` and answers 503 without
 * it. Built once per process; a key that is set but too short throws
 * (`productionLocationPolicy`), loudly, rather than fuzzing with a weak key.
 */
let cachedPolicy: LocationPrivacyPolicy | undefined;
function locationPolicy(): LocationPrivacyPolicy | null {
  const secret = process.env.LOCATION_HMAC_SECRET;
  if (!secret) return null;
  cachedPolicy ??= productionLocationPolicy(secret);
  return cachedPolicy;
}

async function handle(request: Request): Promise<Response> {
  const now = new Date();
  const production = process.env.NODE_ENV === "production";
  return handleKabinetRpc(request, {
    availability: kabinetAuthAvailability(process.env),
    resolve: async () => ({
      ...(await kabinetIdentityOf(kabinetAuth(), getDb(), request.headers, now, production)),
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
    locationPolicy: locationPolicy(),
    production,
    shelterWrites: SHELTER_WRITE_POLICY,
  });
}

export const GET = handle;
export const POST = handle;
