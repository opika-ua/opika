// Zod-free, so the reveal dialog can re-check a stored link through `../core`.

/** Lowercase, as Instagram treats names; dots allowed but not first, last or doubled. */
const INSTAGRAM_HANDLE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
/** First path segments that name a post, a feed or a settings page, never a profile. */
const INSTAGRAM_NOT_A_PROFILE = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
]);

/** A handle that is also an Instagram route would link to that page, not to a profile. */
export const isInstagramHandle = (handle: string): boolean =>
  INSTAGRAM_HANDLE.test(handle) && !INSTAGRAM_NOT_A_PROFILE.has(handle);

/** The authority as typed, so an `@` or a non-ASCII letter the parser would fold away still counts. */
const rawAuthorityOf = (value: string): string =>
  value.replace(/^[^:]*:\/*/, "").split(/[/?#]/, 1)[0] ?? "";

/** Userinfo or a non-ASCII authority: either can make a link read as one host and go to another. */
const hasDisguisedAuthority = (value: string, url: URL): boolean => {
  const authority = rawAuthorityOf(value);
  return (
    url.username !== "" ||
    url.password !== "" ||
    authority.includes("@") ||
    [...authority].some((char) => char.charCodeAt(0) > 0x7f)
  );
};

/**
 * @handle, a bare handle, instagram.com/<h>, https://(www.|m.)instagram.com/<h>[/][?...][#...]
 * -> "<h>" lowercased, or null. Shared by the form and the input schema.
 */
export function normalizeInstagram(raw: string): string | null {
  const value = raw.trim().replace(/^@/, "");
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (!hasScheme && !value.includes("/")) {
    const handle = value.toLowerCase();
    return isInstagramHandle(handle) ? handle : null;
  }
  const withScheme = hasScheme ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port !== "") return null;
  if (hasDisguisedAuthority(withScheme, url)) return null;
  if (!INSTAGRAM_HOSTS.has(url.hostname)) return null;
  const segment = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1]?.toLowerCase();
  return segment !== undefined && isInstagramHandle(segment) ? segment : null;
}

export type FacebookNormalized =
  | { kind: "ok"; url: string }
  | { kind: "error"; error: "httpsOnly" | "notAUrl" | "facebookFormat" };

const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "www.fb.com",
]);
/** Redirectors, login and dialog paths: none is a page, and `l.php` / `flx` forward anywhere. */
const FACEBOOK_NOT_A_PAGE = new Set([
  "l.php",
  "flx",
  "login",
  "login.php",
  "logout.php",
  "sharer",
  "sharer.php",
  "dialog",
  "plugins",
  "recover",
  "checkpoint",
  "settings",
  "help",
]);
/** After the host's slash; a page or group path is far shorter, so a longer one is not a page. */
const FACEBOOK_MAX_PATH = 100;

/**
 * An https facebook.com / www. / m. / fb.com / www.fb.com URL ->
 * "https://www.facebook.com<path>[?id=<digits>]". Every query but profile.php's id is dropped,
 * so no redirect target survives.
 */
export function normalizeFacebook(raw: string): FacebookNormalized {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    const looksLikeHost = /^[^\s/:]+\.[^\s.]{2,}(?:\/\S*)?$/.test(value);
    return { kind: "error", error: looksLikeHost ? "httpsOnly" : "notAUrl" };
  }
  if (url.protocol !== "https:") {
    return { kind: "error", error: url.protocol === "http:" ? "httpsOnly" : "notAUrl" };
  }
  const refuse: FacebookNormalized = { kind: "error", error: "facebookFormat" };
  if (hasDisguisedAuthority(value, url) || url.port !== "") return refuse;
  if (!FACEBOOK_HOSTS.has(url.hostname)) return refuse;
  if (!/^[A-Za-z0-9._\-/%]+$/.test(url.pathname)) return refuse;
  const path = url.pathname.replace(/\/+$/, "");
  if (path.length - 1 > FACEBOOK_MAX_PATH) return refuse;
  const segments = path.split("/").slice(1);
  const first = segments[0]?.toLowerCase();
  if (first === undefined || segments.some((segment) => segment === "")) return refuse;
  if (FACEBOOK_NOT_A_PAGE.has(first)) return refuse;
  if (path.toLowerCase() === "/profile.php") {
    const id = url.searchParams.get("id") ?? "";
    return /^\d{1,20}$/.test(id)
      ? { kind: "ok", url: `https://www.facebook.com/profile.php?id=${id}` }
      : refuse;
  }
  return { kind: "ok", url: `https://www.facebook.com${path}` };
}

/** A stored value is trusted as a link only if it is already its own canonical form. */
export const isCanonicalFacebookUrl = (url: string): boolean => {
  const again = normalizeFacebook(url);
  return again.kind === "ok" && again.url === url;
};
