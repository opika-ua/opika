/**
 * The origin this deployment serves, from configuration and never from the request's own Host
 * (a proxy may forward any Host). Production reads `BETTER_AUTH_URL`, which sign-in already pins
 * to the production origin; outside production a missing value falls back to the request's
 * origin so local runs and the harness need no extra variable. `null` means "unknown": callers
 * must refuse rather than guess.
 */
export function servedSiteOrigin(
  env: Readonly<Record<string, string | undefined>>,
  request: Request,
): string | null {
  const configured = env.BETTER_AUTH_URL;
  if (configured !== undefined && configured !== "") return originOf(configured);
  return env.NODE_ENV === "production" ? null : originOf(request.url);
}

function originOf(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}
