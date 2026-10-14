/**
 * The headers a server-built request into `auth.handler` carries over from
 * the browser's own request.
 *
 * Better Auth itself reads no IP header: `advanced.ipAddress.disableIpTracking`
 * (KH-Q6) turns off both the IP on its session row and its own rate limiter.
 * The client-IP headers still matter, for our limiter: `auth.ts`'s
 * `hooks.before` charges the kabinet budgets on `/magic-link/verify`, keyed
 * on `clientIp(ctx.request)`, and the confirm page's verify is exactly such a
 * server-built request. Without them every sign-in would land in one shared
 * `ip:unknown` bucket. All three of `clientIp`'s headers come along, in its
 * order of preference, so the inner request's key is the outer request's (the
 * proxy's) for the same visitor. `user-agent`, so a session Better Auth
 * creates records the real browser (KH-Q6 keeps it).
 */
const FORWARDED = ["user-agent", "x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] as const;

export function forwardedClientHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}
