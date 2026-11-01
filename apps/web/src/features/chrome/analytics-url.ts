/**
 * Every kabinet sign-in page lives under this path, and some carry a credential in their query
 * string: a reset link's `?token=` (PW-1), the magic link's confirm page's `?token=`, and from
 * PW-2 the invitation's `?zaproshennia=`.
 */
export const SIGN_IN_PAGES_PATH = "/kabinet/vkhid";

const isSignInPage = (pathname: string) =>
  pathname === SIGN_IN_PAGES_PATH || pathname.startsWith(`${SIGN_IN_PAGES_PATH}/`);

/**
 * The URL an analytics event reports, with the query string removed when it is a sign-in page.
 * Oleksii, 2026-10-20, verbatim: "Analytics: in Vercel Analytics' and Speed Insights'
 * beforeSend, strip the query string from /kabinet/vkhid* URLs, with a test." Every other URL is
 * left exactly as it came, and so is one that can't be parsed (nothing to strip from).
 */
export function withoutSignInQuery(url: string): string {
  const relative = url.startsWith("/");
  let parsed: URL;
  try {
    parsed = new URL(url, relative ? "http://relative.invalid" : undefined);
  } catch {
    return url;
  }
  if (!isSignInPage(parsed.pathname) || parsed.search === "") return url;
  parsed.search = "";
  return relative ? `${parsed.pathname}${parsed.hash}` : parsed.toString();
}

/**
 * The one `beforeSend` both Vercel Analytics and Speed Insights are given (`SiteAnalytics`):
 * the event as it is, its URL through `withoutSignInQuery`.
 */
export function stripSignInQuery<Event extends { url: string }>(event: Event): Event {
  return { ...event, url: withoutSignInQuery(event.url) };
}
