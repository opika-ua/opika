import { productionLocationPolicy } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import { clientIp } from "../../../../api/client-ip";
import { getDb } from "../../../../api/db";
import { requireEnv } from "../../../../api/env";
import { shelterWritePolicyOf } from "../../../../kabinet/access";
import { kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { kabinetLimiters, photoUploadLimiters } from "../../../../kabinet/limiters";
import { operatorDisplayName } from "../../../../kabinet/operator";
import { photoUploadConfigOf } from "../../../../kabinet/photo-upload-env";
import { lazyR2Storage, type PhotoUploads } from "../../../../kabinet/photo-uploads";
import { kabinetIdentityOf } from "../../../../kabinet/principal";
import { handleKabinetRpc } from "../../../../kabinet/rpc-route";
import { kabinetAuth } from "../../../../kabinet/runtime";

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

/**
 * P-Q10: on only where all four upload variables are set, never in Preview.
 * Read per request (cheap) so `next build`, which imports this module, needs
 * none of them; the store itself is built once and reused.
 */
let cachedStorage: ReturnType<typeof lazyR2Storage> | undefined;
function photoUploads(): PhotoUploads {
  const config = photoUploadConfigOf(process.env);
  if (config.kind === "off") return config;
  cachedStorage ??= lazyR2Storage(config.r2);
  return { kind: "on", storage: cachedStorage, limiters: photoUploadLimiters };
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
    // K-Q17: refused for every shelter unless KABINET_WRITE_ALLOWLIST names it.
    shelterWrites: shelterWritePolicyOf(process.env),
    photoUploads: photoUploads(),
  });
}

export const GET = handle;
export const POST = handle;
