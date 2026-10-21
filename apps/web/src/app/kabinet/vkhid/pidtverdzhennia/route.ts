import { kabinetAuthAvailability } from "../../../../kabinet/auth-route";
import { handleKabinetConfirm } from "../../../../kabinet/confirm-route";
import { invitationAccepter } from "../../../../kabinet/invitation-accept";
import { kabinetDb } from "../../../../kabinet/kabinet-db";
import { kabinetAuth } from "../../../../kabinet/runtime";

async function handle(request: Request): Promise<Response> {
  return handleKabinetConfirm(request, {
    availability: kabinetAuthAvailability(process.env),
    auth: kabinetAuth,
    // Built per request: `kabinetDb()` is only reached once sign-in has succeeded.
    acceptInvitation: (userId) => invitationAccepter(kabinetDb(), () => new Date())(userId),
  });
}

export const GET = handle;
export const POST = handle;
