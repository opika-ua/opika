import { RESET_LINK } from "./email-links";

/**
 * The kabinet sign-in pages whose URL carries a credential and which the proxy answers for: the
 * reset link's page (PW-1). Oleksii, 2026-10-20, verbatim: "On /kabinet/vkhid* pages that carry
 * a token: Cache-Control: no-store and Referrer-Policy: no-referrer."
 *
 * Not here: the magic link's confirm page (`/kabinet/vkhid/pidtverdzhennia`), a route handler that
 * sets its own headers (`CONFIRM_HEADERS`: `no-store` already, and `strict-origin`, not
 * `no-referrer`). Its «Увійти» is a form POST, and under `no-referrer` a browser sends that POST
 * with `Origin: null`, which the confirm page's login-CSRF check refuses (IN-T8, Oleksii
 * 2026-10-14). He settled the conflict, verbatim (2026-10-20, inbox PW1-Q1): "PW1-Q1: (a). Use
 * strict-origin on pages whose button submits an ordinary form (the magic-link confirm page), and
 * no-referrer everywhere else as specified (the reset page included)." `confirm-route.test.ts`
 * pins that the confirm page's form POST passes IN-T8 under its own policy. The reset page has no
 * such conflict: its POST is a `fetch`, whose `Origin` no referrer policy removes. PW-2 adds the
 * invitation's `?zaproshennia=`.
 */
export const TOKEN_PAGE_PATHS: readonly string[] = [RESET_LINK.path];

export const TOKEN_PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

export const isTokenPagePath = (pathname: string): boolean => TOKEN_PAGE_PATHS.includes(pathname);
