/**
 * Every kabinet page lives under this path. Sign-in pages carry credentials in their query (a
 * reset or magic-link `?token=`, the invitation's `?zaproshennia=`, the registration `?token=`),
 * and the operator's shelter search carries free text that can be a name, email or phone.
 */
export const KABINET_PATH = "/kabinet";

const isKabinetPage = (pathname: string) =>
  pathname === KABINET_PATH || pathname.startsWith(`${KABINET_PATH}/`);

/**
 * The URL an analytics event reports, with the query string removed on every kabinet page.
 * Oleksii, 2026-10-20, verbatim: "Analytics: in Vercel Analytics' and Speed Insights'
 * beforeSend, strip the query string from /kabinet/vkhid* URLs, with a test." Widened by his
 * 2026-11-24 audit answer, verbatim: "4. Analytics: strip the query on every /kabinet page."
 * Public URLs keep their query (gallery filters), and an unparseable one is left as it came.
 */
export function withoutKabinetQuery(url: string): string {
  const relative = url.startsWith("/");
  let parsed: URL;
  try {
    parsed = new URL(url, relative ? "http://relative.invalid" : undefined);
  } catch {
    return url;
  }
  if (!isKabinetPage(parsed.pathname) || parsed.search === "") return url;
  parsed.search = "";
  return relative ? `${parsed.pathname}${parsed.hash}` : parsed.toString();
}

/**
 * The one `beforeSend` both Vercel Analytics and Speed Insights are given (`SiteAnalytics`):
 * the event as it is, its URL through `withoutKabinetQuery`.
 */
export function stripKabinetQuery<Event extends { url: string }>(event: Event): Event {
  return { ...event, url: withoutKabinetQuery(event.url) };
}
