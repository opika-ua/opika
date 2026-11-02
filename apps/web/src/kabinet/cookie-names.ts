/**
 * The kabinet session cookie's names, in a module with no imports so light callers (the public
 * RPC route's cookie-presence check) need not load Better Auth.
 */
export function kabinetCookieName(base: "session_token" | "dont_remember", secure: boolean) {
  return `${secure ? "__Host-" : ""}kabinet.${base}`;
}
