"use server";

import { kabinetInviteLandingRepo } from "@opika/db/repos";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "../../../api/client-ip";
import { getDb } from "../../../api/db";
import { leavesSignIn } from "../../../features/kabinet/home";
import { INVITE_LINK } from "../../../kabinet/email-links";
import {
  type InviteLanding,
  sendMagicLinkThroughAuth,
  submitInviteLanding,
} from "../../../kabinet/invite-landing";
import { signInLimiters } from "../../../kabinet/limiters";
import { kabinetIdentityOf } from "../../../kabinet/principal";
import { kabinetAuthOrNotFound, kabinetAvailabilityOrNotFound } from "../available-auth";

/**
 * The invite landing's one button (EM-Q3): the only path that sends the
 * invited address a magic link. A server action, so the answer renders in
 * K1's card on the same page, and the form still works before (or without)
 * JavaScript. Next's own action check compares Origin with Host; this
 * repeats the confirm page's stricter one (`isSameOriginPost`, against the
 * configured base URL) inside `submitInviteLanding`, so the guard is ours and
 * tested rather than a framework default.
 *
 * Same conditions as the page: 404 while sign-in is unavailable, and a
 * signed-in visitor goes to `/kabinet` with nothing sent. A refused
 * cross-site post renders as `unusable`: whoever forged it learns nothing.
 */
export async function sendInviteLink(
  _previous: InviteLanding | null,
  form: FormData,
): Promise<InviteLanding> {
  const availability = kabinetAvailabilityOrNotFound();
  const auth = kabinetAuthOrNotFound();
  const requestHeaders = new Headers(await headers());
  const now = new Date();
  const identity = await kabinetIdentityOf(
    auth,
    getDb(),
    requestHeaders,
    now,
    process.env.NODE_ENV === "production",
  );
  if (leavesSignIn(identity.principal)) redirect("/kabinet");
  const ids = form.getAll(INVITE_LINK.param);
  const answer = await submitInviteLanding(
    {
      origin: requestHeaders.get("origin"),
      // A repeated field is not one id (as on the page's query string).
      invitationId: ids.length === 1 ? ids[0] : null,
    },
    {
      baseURL: availability.baseURL,
      lookup: (id) => kabinetInviteLandingRepo(getDb()).invitationOf(id),
      limiters: signInLimiters,
      ip: clientIp(new Request(availability.baseURL, { headers: requestHeaders })),
      now,
      sendMagicLink: (email) =>
        sendMagicLinkThroughAuth(auth, availability.baseURL, email, requestHeaders),
    },
  );
  return answer.kind === "forbidden" ? { kind: "unusable" } : answer;
}
