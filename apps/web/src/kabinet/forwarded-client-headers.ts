/**
 * The client-IP headers a server-built `auth.handler` request needs so our limiter keys it on the
 * visitor, not one shared "unknown" bucket. No `user-agent`: `databaseHooks.session.create.before`
 * keeps it off the session row (D6); not forwarding it is only a second layer.
 */
const FORWARDED = ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] as const;

export function forwardedClientHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}
