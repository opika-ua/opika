/**
 * The headers a server-built request into `auth.handler` carries over from
 * the browser's own request.
 *
 * Better Auth keys its rate limits by the client IP it reads from
 * `x-forwarded-for` (its default `ipAddressHeaders`). A request built on the
 * server without it has no IP, and in production Better Auth then puts it in
 * one shared `no-trusted-ip` bucket per path: every visitor's request counts
 * against the same limit (email-track review, finding 2). With IP tracking
 * disabled (`advanced.ipAddress.disableIpTracking`) Better Auth reads none of
 * these and runs no limit of its own, and forwarding them changes nothing.
 * `x-real-ip` comes along for an environment that sets only that;
 * `user-agent`, so a session Better Auth creates records the real browser.
 */
const FORWARDED = ["user-agent", "x-forwarded-for", "x-real-ip"] as const;

export function forwardedClientHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}
