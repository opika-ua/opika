import { INVITE_LINK, RESET_LINK } from "./email-links";
import { REGISTRATION_LINK_PATHS } from "./registration/registration-links";

/**
 * The kabinet sign-in pages whose URL carries a credential and which the proxy answers for: the reset
 * link's page (PW-1) and the invitation link's, `/kabinet/vkhid?zaproshennia=<token>` (PW-2), matched
 * by the parameter: any `zaproshennia`, valid or not, repeated or empty, since the page treats each as
 * a link. Oleksii, 2026-10-20, verbatim: "On /kabinet/vkhid* pages that carry a token: Cache-Control:
 * no-store and Referrer-Policy: no-referrer." The proxy sends the `no-store`.
 *
 * Referrer-Policy: the owner superseded `no-referrer` here and PW1-Q1 (a)'s `strict-origin` exception
 * for the confirm page on 2026-11-16 with `strict-origin` on all of /kabinet, sent by next.config
 * alone (`REFERRER_POLICY_RULES`); `no-referrer` would make a form POST's Origin `null` (IN-T8).
 *
 * The confirmation email's two link pages (R3) too: their HTML carries the token, and the confirm
 * page the address.
 */
export const TOKEN_PAGE_PATHS: readonly string[] = [
  RESET_LINK.path,
  REGISTRATION_LINK_PATHS.confirm_email,
  REGISTRATION_LINK_PATHS.not_me,
];

export const TOKEN_PAGE_HEADERS = { "Cache-Control": "no-store" } as const;

export const isTokenPage = (url: { pathname: string; searchParams: URLSearchParams }): boolean =>
  TOKEN_PAGE_PATHS.includes(url.pathname) ||
  (url.pathname === INVITE_LINK.path && url.searchParams.has(INVITE_LINK.param));
