import { kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { handleKabinetConfirm } from "../../../../kabinet/confirm-route";
import { kabinetAuth } from "../../../../kabinet/runtime";

async function handle(request: Request): Promise<Response> {
  return handleKabinetConfirm(request, {
    availability: kabinetAuthAvailability(process.env),
    auth: kabinetAuth,
  });
}

export const GET = handle;
export const POST = handle;
