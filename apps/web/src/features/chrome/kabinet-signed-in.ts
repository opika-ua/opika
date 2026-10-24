import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { kabinetCookieName } from "../../kabinet/auth";

/** The shape `next/headers`' cookie store satisfies — narrowed so this stays unit-testable without mocking the module. */
interface CookiePresence {
  has(name: string): boolean;
}

/**
 * Designer feedback batch D (2026-10-23): whether to show the role-aware
 * header's «Кабінет» nav instead of the visitor nav. Presence only, never
 * validated here — no DB read on a public page, and the session token
 * itself is never read, only whether a cookie of this name exists. Checks
 * both names since production and dev prefix the cookie differently
 * (`kabinetCookieName`'s own doc comment). A stale or forged cookie changes
 * nothing except which header renders: actually using the kabinet still
 * goes through its own real session check (`kabinetIdentityOf`) and a
 * rejected session just lands on the sign-in page.
 */
export function kabinetSignedInFrom(store: CookiePresence): boolean {
  return (
    store.has(kabinetCookieName("session_token", true)) ||
    store.has(kabinetCookieName("session_token", false))
  );
}

/**
 * The only caller outside a test: reads the real incoming request's
 * cookies, server-side. Never exposed to client JS — this is a Server
 * Component/route concern, and the boolean it resolves to is the only
 * thing that ever crosses into a Client Component's props.
 *
 * Every page this calls from is `force-dynamic`, so a real request always
 * has a request scope — the only place `cookies()` throws "called outside
 * a request scope" is a vitest render that calls a route's default
 * `Page` export directly, with no real Next server underneath it at all.
 * Several test files do exactly that on purpose (`animal-surfaces.test.tsx`
 * exercises `notFound()`/the error boundary through the real export, not
 * through a testable inner function). Failing to "not signed in" there is
 * the same answer the cookie's own absence would give — never a different
 * code path, never silently treated as signed in.
 *
 * Review of 6825ffd, finding 4: `unstable_rethrow` first, so this never
 * swallows Next's own prerender-bailout signal for a future caller that
 * isn't `force-dynamic` — without it, that signal would be caught here and
 * the page would be served statically as "not signed in" for everyone,
 * silently. Today's six callers are all `force-dynamic`, so nothing bails
 * out this way yet; this is what keeps that true if one ever isn't.
 */
export async function kabinetSessionCookiePresent(): Promise<boolean> {
  try {
    return kabinetSignedInFrom(await cookies());
  } catch (error) {
    unstable_rethrow(error);
    return false;
  }
}
