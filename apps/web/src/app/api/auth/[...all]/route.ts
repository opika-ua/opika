import { handleKabinetAuth, kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { signInLimiters } from "../../../../kabinet/limiters";
import { kabinetAuth } from "../../../../kabinet/runtime";

async function handle(request: Request): Promise<Response> {
  return handleKabinetAuth(request, {
    availability: kabinetAuthAvailability(process.env),
    auth: kabinetAuth,
    limiters: signInLimiters,
    now: new Date(),
  });
}

export const GET = handle;
export const POST = handle;
