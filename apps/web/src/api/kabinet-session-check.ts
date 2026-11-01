import { kabinetCookieName } from "../kabinet/auth";
import { kabinetPageUserId } from "../kabinet/runtime";

const KABINET_COOKIE_NAMES: ReadonlySet<string> = new Set([
  kabinetCookieName("session_token", true),
  kabinetCookieName("session_token", false),
]);

/** A string check on cookie names only: a request without the cookie costs nothing. */
export function hasKabinetCookie(cookieHeader: string | null): boolean {
  if (cookieHeader === null) return false;
  return cookieHeader
    .split(";")
    .some((pair) => KABINET_COOKIE_NAMES.has((pair.split("=")[0] ?? "").trim()));
}

/**
 * The lazy "is this a live shelter session" lookup for `AppContext`, or undefined without the
 * cookie. The cookie is a hint, never the decision: the server session is validated, and any
 * failure (auth unavailable, lapsed, a throw) is a visitor.
 */
export function kabinetSessionCheckFor(
  headers: Headers,
  now: Date,
): (() => Promise<boolean>) | undefined {
  if (!hasKabinetCookie(headers.get("cookie"))) return undefined;
  return async () => {
    try {
      return (await kabinetPageUserId(headers, now)) !== null;
    } catch {
      return false;
    }
  };
}
