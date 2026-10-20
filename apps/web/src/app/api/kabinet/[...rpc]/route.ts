import { productionLocationPolicy } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import { clientIp } from "../../../../api/client-ip";
import { getDb } from "../../../../api/db";
import { requireEnv } from "../../../../api/env";
import { SHELTER_WRITE_POLICY } from "../../../../kabinet/access";
import { kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { inviteCredentialsOf } from "../../../../kabinet/invite-password";
import { inviteLimiters, kabinetLimiters, photoUploadLimiters } from "../../../../kabinet/limiters";
import { operatorDisplayName } from "../../../../kabinet/operator";
import { photoUploadConfigOf } from "../../../../kabinet/photo-upload-env";
import {
  lazyR2Storage,
  PHOTO_PROCESSING_BUDGET_MS,
  type PhotoUploads,
} from "../../../../kabinet/photo-uploads";
import { kabinetIdentityOf } from "../../../../kabinet/principal";
import { handleKabinetRpc } from "../../../../kabinet/rpc-route";
import { kabinetAuth } from "../../../../kabinet/runtime";

/**
 * The longest this function may run on Vercel, in seconds, set here so it
 * doesn't depend on the project's settings. Photo uploads come through this
 * route, and it must stay above their processing budget
 * (`PHOTO_PROCESSING_BUDGET_MS`, 10 s), so an over-budget upload gets its 500
 * and «Не завантажилось» rather than the platform cutting the request off
 * first. Oleksii, 2026-10-19, verbatim: "Add a check that the upload route's
 * Vercel maxDuration is above the 10 s processing budget, so the budget always
 * fires first." A literal, because Next reads route segment config
 * statically; pinned by `photo-processing-budget.test.ts`.
 */
export const maxDuration = 60;

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
  return {
    kind: "on",
    storage: cachedStorage,
    limiters: photoUploadLimiters,
    processingBudgetMs: PHOTO_PROCESSING_BUDGET_MS,
  };
}

async function handle(request: Request): Promise<Response> {
  const now = new Date();
  const production = process.env.NODE_ENV === "production";
  const availability = kabinetAuthAvailability(process.env);
  return handleKabinetRpc(request, {
    availability,
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
    // The one served write policy, read from no environment variable.
    shelterWrites: SHELTER_WRITE_POLICY,
    photoUploads: photoUploads(),
    invitePasswords: () => ({
      kind: "on",
      perIp: inviteLimiters.perIp,
      ip: clientIp(request),
      credentials: inviteCredentialsOf(
        kabinetAuth(),
        availability.kind === "available" ? availability.baseURL : "",
        request.headers,
      ),
    }),
  });
}

export const GET = handle;
export const POST = handle;
