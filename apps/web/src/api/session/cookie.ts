/**
 * Session cookie configuration.
 *
 * __Host- prefix: implies Secure, Path=/, no Domain attribute. This
 * prevents a subdomain attacker from setting or reading the cookie, and
 * ensures it is only sent over HTTPS. In local development (HTTP),
 * browsers silently ignore __Host- cookies — use the non-prefixed
 * fallback via `cookieName()`.
 */

const COOKIE_NAME_PROD = "__Host-session";
const COOKIE_NAME_DEV = "session";

export function cookieName(): string {
  return process.env.NODE_ENV === "production" ? COOKIE_NAME_PROD : COOKIE_NAME_DEV;
}

export function sessionCookieOptions(maxAgeSeconds: number): string {
  const parts = [
    `${cookieName()}={token}`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Build the Set-Cookie header value for a new session.
 */
export function setSessionCookie(token: string, maxAgeSeconds: number): string {
  return sessionCookieOptions(maxAgeSeconds).replace("{token}", token);
}

/**
 * Build a Set-Cookie header that expires (deletes) the session cookie.
 */
export function clearSessionCookie(): string {
  const parts = [`${cookieName()}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Extract the session token from a Cookie header string.
 */
export function parseSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const name = cookieName();
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) {
      const value = rest.join("=");
      return value || null;
    }
  }
  return null;
}
