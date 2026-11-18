import { CONTACT_INPUT_MAX_LENGTH, normalizeUaPhone } from "../contact";
import { normalizeFacebook, normalizeInstagram } from "../contact-links";

/**
 * Normalize, don't reject (§11.4): what a shelter types into the registration form, turned into
 * one canonical value server-side, so the form, the queue and the duplicate check agree.
 */

export type PublicLinkNormalized = { kind: "ok"; url: string } | { kind: "invalid" };

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "www.fb.com",
]);
const TELEGRAM_HOSTS = new Set(["t.me", "telegram.me", "www.t.me", "www.telegram.me"]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
/** A registrable-looking name: at least one dot and an alphabetic (or punycode) top-level label. */
const PUBLIC_HOSTNAME = /^(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

const parseHttpUrl = (value: string): URL | null => {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // No userinfo (a disguised host) and no port: a public page is neither.
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (IPV4.test(url.hostname) || url.hostname.startsWith("[")) return null;
  if (!PUBLIC_HOSTNAME.test(url.hostname)) return null;
  url.protocol = "https:";
  url.hash = "";
  return url;
};

/**
 * The site or social page a shelter submits. A bare `@handle` is refused rather than guessed: it
 * could be Instagram or Telegram, and the operator must open the right page. Instagram and
 * Facebook take their canonical forms; Telegram becomes `t.me`; anything else is the https URL.
 * The server never fetches it (SSRF, §11.3).
 */
export function normalizePublicLink(raw: string): PublicLinkNormalized {
  const value = raw.trim();
  if (value === "" || value.length > CONTACT_INPUT_MAX_LENGTH || /\s/.test(value)) {
    return { kind: "invalid" };
  }
  if (value.startsWith("@")) return { kind: "invalid" };
  const url = parseHttpUrl(value);
  if (url === null) return { kind: "invalid" };

  if (INSTAGRAM_HOSTS.has(url.hostname)) {
    const handle = normalizeInstagram(url.toString());
    return handle === null
      ? { kind: "invalid" }
      : { kind: "ok", url: `https://www.instagram.com/${handle}/` };
  }
  if (FACEBOOK_HOSTS.has(url.hostname)) {
    const normalized = normalizeFacebook(url.toString());
    return normalized.kind === "ok" ? { kind: "ok", url: normalized.url } : { kind: "invalid" };
  }
  if (TELEGRAM_HOSTS.has(url.hostname)) {
    const path = url.pathname.replace(/\/+$/, "");
    return path === "" ? { kind: "invalid" } : { kind: "ok", url: `https://t.me${path}` };
  }
  return { kind: "ok", url: url.toString() };
}

/**
 * What two links are compared on (§11.5): host without `www.` / `m.`, plus the path, lowercased
 * and without a trailing slash. The query is ignored except Facebook's numeric profile id.
 */
export function linkMatchKey(link: string): string | null {
  const url = parseHttpUrl(link.trim());
  if (url === null) return null;
  const host = url.hostname.replace(/^(?:www|m)\./, "");
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  const profileId = path === "/profile.php" ? url.searchParams.get("id") : null;
  return profileId === null ? `${host}${path}` : `${host}${path}?id=${profileId}`;
}

export type AdopterContactNormalized =
  | { kind: "ok"; channel: { kind: "phone"; e164: string } | { kind: "telegram"; handle: string } }
  | { kind: "invalid" };

const TELEGRAM_HANDLE = /^[A-Za-z0-9_]{5,32}$/;
const TELEGRAM_LINK = /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/([A-Za-z0-9_]+)\/?$/i;

/**
 * «Телефон або Telegram для людей»: a Ukrainian number in any common form, or a Telegram handle as
 * `@name`, `t.me/name` or a bare name with a letter in it. Digits alone are only ever a phone.
 */
export function normalizeAdopterContact(raw: string): AdopterContactNormalized {
  const value = raw.trim();
  if (value === "" || value.length > CONTACT_INPUT_MAX_LENGTH) return { kind: "invalid" };

  const fromLink = TELEGRAM_LINK.exec(value)?.[1];
  const handle = fromLink ?? (value.startsWith("@") ? value.slice(1) : null);
  if (handle !== null) {
    return TELEGRAM_HANDLE.test(handle)
      ? { kind: "ok", channel: { kind: "telegram", handle } }
      : { kind: "invalid" };
  }

  const phone = normalizeUaPhone(value);
  if (phone !== null) return { kind: "ok", channel: { kind: "phone", e164: phone } };

  return TELEGRAM_HANDLE.test(value) && /[A-Za-z]/.test(value)
    ? { kind: "ok", channel: { kind: "telegram", handle: value } }
    : { kind: "invalid" };
}

/** Words that name the legal form or the kind of place, not the shelter (§11.5). */
const NAME_NOISE = new Set(["го", "бо", "притулок", "громадська", "благодійна", "організація"]);

/**
 * A shelter name reduced to what tells two shelters apart: NFKC, lowercase, apostrophes dropped,
 * quotes and punctuation as spaces, and the legal-form words removed.
 */
export function shelterNameMatchKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’ʼ`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((word) => word !== "" && !NAME_NOISE.has(word))
    .join(" ");
}
