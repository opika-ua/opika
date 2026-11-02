import { headers } from "next/headers";
import { cache } from "react";
import { kabinetAuthAvailability } from "../../kabinet/auth-route";
import { kabinetDb } from "../../kabinet/kabinet-db";
import { kabinetSessionPersonOf } from "../../kabinet/principal";
import { kabinetAuth } from "../../kabinet/runtime";
import type { SignedInPerson } from "../../kabinet/signed-in-person";

/**
 * Who is signed in, once per request, for the header and the account page: `{ name, email }` and
 * nothing else of the session. Never refreshes the session and never throws: a failed read is "no
 * line", not a broken page. `/kabinet` is `force-dynamic` and this reads the request's cookies, so
 * one person's answer is never shared with another request.
 */
export const signedInPerson = cache(async (): Promise<SignedInPerson | null> => {
  if (kabinetAuthAvailability(process.env).kind === "unavailable") return null;
  try {
    return await kabinetSessionPersonOf(
      kabinetAuth(),
      kabinetDb(),
      new Headers(await headers()),
      new Date(),
    );
  } catch {
    return null;
  }
});
