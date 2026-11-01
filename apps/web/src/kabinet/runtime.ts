import { after } from "next/server";
import { createKabinetAuth, type KabinetAuth } from "./auth";
import { kabinetAuthAvailability } from "./auth-route";
import { kabinetDb } from "./kabinet-db";
import { kabinetLimiters, passwordLimiters } from "./limiters";
import { kabinetSessionUserIdOf } from "./principal";

/**
 * The one Better Auth instance per server process, shared by the sign-in
 * route (`/api/auth/*`) and the kabinet RPC route (`/api/kabinet/*`). Built
 * on first use, not at module scope: `next build` imports both route files.
 * Only ever built when `kabinetAuthAvailability` says so; both routes answer
 * 503 before calling this otherwise.
 */
let cachedAuth: KabinetAuth | undefined;

export function kabinetAuth(): KabinetAuth {
  const availability = kabinetAuthAvailability(process.env);
  if (availability.kind === "unavailable") throw new Error(availability.reason);
  cachedAuth ??= createKabinetAuth({
    db: kabinetDb(),
    sender: availability.sender,
    schedule: (work) => after(work),
    baseURL: availability.baseURL,
    secret: availability.secret,
    secureCookies: availability.baseURL.startsWith("https://"),
    limiters: kabinetLimiters,
    passwordLimiters,
    passwordMail: availability.passwordMail,
  });
  return cachedAuth;
}

/**
 * The signed-in user a `/kabinet` page load is charged to (KH-Q8), or null.
 * While sign-in is unavailable there is no session to read, and
 * `kabinetAuth()` would throw: the pages answer 404 then, charged per IP only.
 */
export async function kabinetPageUserId(headers: Headers, now: Date): Promise<string | null> {
  if (kabinetAuthAvailability(process.env).kind === "unavailable") return null;
  return kabinetSessionUserIdOf(kabinetAuth(), kabinetDb(), headers, now);
}

/**
 * Whether the request holds a live kabinet session, read without refreshing it: for public
 * routes, where use of the site is not a visit to the kabinet (PW1-Q2).
 */
export async function kabinetViewerUserId(headers: Headers, now: Date): Promise<string | null> {
  if (kabinetAuthAvailability(process.env).kind === "unavailable") return null;
  return kabinetSessionUserIdOf(kabinetAuth(), kabinetDb(), headers, now, { refresh: false });
}
