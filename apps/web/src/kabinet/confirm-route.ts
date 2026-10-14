import { uk } from "@opika/i18n";
import { z } from "zod";
import type { KabinetAuth } from "./auth";
import { CONFIRM_PATH } from "./auth";
import type { KabinetAuthAvailability } from "./auth-route";
import { forwardedClientHeaders } from "./forwarded-client-headers";
import type { AcceptInvitation, InvitationAcceptOutcome } from "./invitation-accept";

/**
 * The page an emailed sign-in link opens (IN-Q11,
 * `docs/h2-invite-confirm-shapes.md`). Mail scanners follow every link
 * (Brevo rewrites them all), and Better Auth's verify consumes the token on
 * GET. So the GET here only shows one button, and only that button's POST
 * runs the verify, server-side, through `auth.handler`: the same entry the
 * `/api/auth` route forwards to, so no Better Auth server API beyond
 * `getSession` is called (`no-self-serve-yet.test.ts`).
 *
 * Once Better Auth has signed the person in, the same POST accepts a pending
 * invitation for their address (IN-Q12): a separate step, after the session
 * exists, so a failed accept never undoes the sign-in. It is told apart from
 * success and retried, never a 500 and never silent.
 */

/**
 * On every response: the URL carries a credential.
 *
 * `strict-origin`, not `no-referrer` (IN-T8, Oleksii 2026-10-14). Under
 * `no-referrer` a browser sends `Origin: null` on the «Увійти» form POST, so
 * the Origin check below refused every real sign-in. `strict-origin` sends
 * only the origin, never the path or query (so never the token), to every
 * site including our own, and the POST then carries a real Origin. Not
 * `same-origin`: that sends the full URL, token included, as the Referer of
 * our own POST and into our own request logs.
 */
export const CONFIRM_HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "strict-origin",
} as const;

const VERIFY_PATH = "/api/auth/magic-link/verify";
const SIGNED_IN_PATH = "/kabinet";
const SIGN_IN_PATH = "/kabinet/vkhid";

/**
 * Better Auth's tokens are 32 letters. Anything outside this shape is never
 * a token we issued, and keeping to it is also what makes it safe to place
 * in the page's HTML.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,256}$/;

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

type PageState =
  | { kind: "confirm"; token: string }
  | { kind: "invalid" }
  /** Signed in, but the invitation's accept failed (IN-Q12): the retry is `/kabinet`, which runs it again. */
  | { kind: "join_failed" };

function page(state: PageState, status: number): Response {
  const copy = uk.kabinet.confirm;
  const body = (() => {
    switch (state.kind) {
      case "confirm":
        return `<p>${escapeHtml(copy.intro)}</p>
<form method="post" action="${CONFIRM_PATH}">
<input type="hidden" name="token" value="${escapeHtml(state.token)}">
<button type="submit">${escapeHtml(copy.submit)}</button>
</form>`;
      case "invalid":
        return `<p role="alert">${escapeHtml(copy.invalid)}</p>
<p><a href="${SIGN_IN_PATH}">${escapeHtml(copy.requestNew)}</a></p>`;
      case "join_failed":
        return `<p role="alert">${escapeHtml(copy.joinFailed)}</p>
<p><a href="${SIGNED_IN_PATH}">${escapeHtml(copy.joinRetry)}</a></p>`;
      /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
      default: {
        const unreachable: never = state;
        return unreachable;
      }
    }
  })();
  // Self-contained on purpose: nothing loaded from anywhere, so nothing
  // else ever sees this URL (IN-T6; restyled to K1's card with the screens PR).
  const html = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(copy.title)}</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#faf7f2;color:#2b2622}
main{max-width:400px;margin:0 auto;padding:48px 16px}
button{min-height:48px;width:100%;font:inherit;border:0;border-radius:8px;background:#2b2622;color:#faf7f2;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid #2b2622;outline-offset:3px}
</style>
</head>
<body><main><h1>${escapeHtml(copy.title)}</h1>
${body}
</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: { ...CONFIRM_HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}

const plain = (text: string, status: number) =>
  new Response(text, { status, headers: CONFIRM_HEADERS });

export async function handleKabinetConfirm(
  request: Request,
  deps: {
    availability: KabinetAuthAvailability;
    auth: () => KabinetAuth;
    /** Required, so no wiring of this route can sign in without accepting (IN-Q12). */
    acceptInvitation: AcceptInvitation;
  },
): Promise<Response> {
  // KS-T1: the kabinet's pages are 404 wherever sign-in is unavailable.
  if (deps.availability.kind === "unavailable") return plain("Not Found", 404);

  if (request.method === "GET") {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return TOKEN_SHAPE.test(token)
      ? page({ kind: "confirm", token }, 200)
      : page({ kind: "invalid" }, 400);
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...CONFIRM_HEADERS, allow: "GET, POST" },
    });
  }

  // Login CSRF (IN-T7): another site could post its own token here and sign
  // the visitor into the attacker's account. Browsers send Origin on every
  // form POST; a request without one, or with `Origin: null`, is refused too.
  // A real Origin arrives only because the page's Referrer-Policy is not
  // `no-referrer` (CONFIRM_HEADERS, IN-T8): `test/harness/kabinet-confirm.harness.ts`
  // drives a real browser through it.
  const origin = new URL(deps.availability.baseURL).origin;
  if (request.headers.get("origin") !== origin) return plain("Forbidden", 403);

  let token: unknown;
  try {
    token = (await request.formData()).get("token");
  } catch {
    return page({ kind: "invalid" }, 400);
  }
  if (typeof token !== "string" || !TOKEN_SHAPE.test(token)) return page({ kind: "invalid" }, 400);

  const verifyUrl = new URL(VERIFY_PATH, deps.availability.baseURL);
  verifyUrl.searchParams.set("token", token);
  const headers = forwardedClientHeaders(request.headers);
  // No callbackURL: Better Auth then answers 200 on success and redirects
  // only on failure. Its 200 body carries the session token, so it's never
  // passed on; only the cookie is.
  const verified = await deps.auth().handler(new Request(verifyUrl, { method: "GET", headers }));
  const cookies = verified.headers.getSetCookie();
  if (verified.status !== 200 || cookies.length === 0) return page({ kind: "invalid" }, 400);

  // Signed in from here on: every answer below carries the session cookie.
  const signedIn = (response: Response) => {
    for (const cookie of cookies) response.headers.append("set-cookie", cookie);
    return response;
  };
  // The user is Better Auth's own answer for the token just consumed, read
  // server-side, never anything the client sent. Its body is read and dropped
  // (it carries the session token). If it can't be read, `/kabinet` runs the
  // accept itself on arrival (`selfHealingIdentity`).
  const user = SignedInUserSchema.safeParse(await verified.json().catch(() => null));
  const accepted = user.success
    ? await deps
        .acceptInvitation(user.data.user.id)
        .catch((): InvitationAcceptOutcome => ({ kind: "failed" }))
    : null;
  // A conflict (the address already holds a role) never blocks sign-in
  // (IN-Q13): `/kabinet` shows whatever role they do hold.
  if (accepted?.kind === "failed") return signedIn(page({ kind: "join_failed" }, 200));
  return signedIn(
    new Response(null, {
      status: 303,
      headers: { ...CONFIRM_HEADERS, location: SIGNED_IN_PATH },
    }),
  );
}

const SignedInUserSchema = z.object({ user: z.object({ id: z.string().min(1) }) });
