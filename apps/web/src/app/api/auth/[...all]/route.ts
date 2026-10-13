import { after } from "next/server";
import { getDb } from "../../../../api/db";
import { sharedRateLimiter } from "../../../../api/rate-limit";
import { createKabinetAuth, type KabinetAuth } from "../../../../kabinet/auth";
import { handleKabinetAuth, kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { SIGN_IN_LIMITS } from "../../../../kabinet/sign-in-limit";

const limiters = {
  perAddress: sharedRateLimiter({ name: "kabinet-sign-in-address", ...SIGN_IN_LIMITS.perAddress }),
  perIp: sharedRateLimiter({ name: "kabinet-sign-in-ip", ...SIGN_IN_LIMITS.perIp }),
};

let cachedAuth: KabinetAuth | undefined;

/** Built on first use, not at module scope: `next build` imports this file. */
function auth(): KabinetAuth {
  const availability = kabinetAuthAvailability(process.env);
  if (availability.kind === "unavailable") throw new Error(availability.reason);
  cachedAuth ??= createKabinetAuth({
    db: getDb(),
    sender: availability.sender,
    schedule: (work) => after(work),
    baseURL: availability.baseURL,
    secret: availability.secret,
    secureCookies: availability.baseURL.startsWith("https://"),
  });
  return cachedAuth;
}

async function handle(request: Request): Promise<Response> {
  return handleKabinetAuth(request, {
    availability: kabinetAuthAvailability(process.env),
    auth,
    limiters,
    now: new Date(),
  });
}

export const GET = handle;
export const POST = handle;
