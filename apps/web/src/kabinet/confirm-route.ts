import { uk } from "@opika/i18n";
import type { KabinetAuth } from "./auth";
import { CONFIRM_PATH } from "./auth";
import type { KabinetAuthAvailability } from "./auth-route";

/**
 * The page an emailed sign-in link opens (IN-Q11,
 * `docs/h2-invite-confirm-shapes.md`). Mail scanners follow every link
 * (Brevo rewrites them all), and Better Auth's verify consumes the token on
 * GET. So the GET here only shows one button, and only that button's POST
 * runs the verify, server-side, through `auth.handler`: the same entry the
 * `/api/auth` route forwards to, so no Better Auth server API beyond
 * `getSession` is called (`no-self-serve-yet.test.ts`).
 */

/** On every response: the URL carries a credential. */
export const CONFIRM_HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
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

type PageState = { kind: "confirm"; token: string } | { kind: "invalid" };

function page(state: PageState, status: number): Response {
  const copy = uk.kabinet.confirm;
  const body =
    state.kind === "confirm"
      ? `<p>${escapeHtml(copy.intro)}</p>
<form method="post" action="${CONFIRM_PATH}">
<input type="hidden" name="token" value="${escapeHtml(state.token)}">
<button type="submit">${escapeHtml(copy.submit)}</button>
</form>`
      : `<p role="alert">${escapeHtml(copy.invalid)}</p>
<p><a href="${SIGN_IN_PATH}">${escapeHtml(copy.requestNew)}</a></p>`;
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
  deps: { availability: KabinetAuthAvailability; auth: () => KabinetAuth },
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
  // form POST; a request without one is refused too.
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
  const headers = new Headers();
  for (const name of ["user-agent", "x-forwarded-for", "x-real-ip"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // No callbackURL: Better Auth then answers 200 on success and redirects
  // only on failure. Its 200 body carries the session token, so it's never
  // passed on; only the cookie is.
  const verified = await deps.auth().handler(new Request(verifyUrl, { method: "GET", headers }));
  const cookies = verified.headers.getSetCookie();
  if (verified.status !== 200 || cookies.length === 0) return page({ kind: "invalid" }, 400);

  const response = new Response(null, {
    status: 303,
    headers: { ...CONFIRM_HEADERS, location: SIGNED_IN_PATH },
  });
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}
