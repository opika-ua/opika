import { z } from "zod";
import { donationUrlProblemOf } from "./donation";

const E164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/);

/**
 * The Ukrainian shape: +380 and nine digits, the first of them 1-9 (no national number starts with
 * 0). Spaces, dashes, dots and brackets are not part of it.
 */
const UA_PHONE = /^\+380[1-9]\d{8}$/;

/**
 * What a person typed as a Ukrainian number, as +380XXXXXXXXX, or null when it is not one.
 * Accepts the +380, 380 and local 0XX forms with spaces, dashes, dots and brackets. Pure, so the
 * form and the server's input schema normalise with one rule.
 */
export function normalizeUaPhone(raw: string): string | null {
  const stripped = raw.replace(/[\s\-.()]/g, "");
  const digits = stripped.startsWith("+") ? stripped.slice(1) : stripped;
  if (!/^\d+$/.test(digits)) return null;
  const national = stripped.startsWith("+")
    ? digits.startsWith("380")
      ? digits.slice(3)
      : null
    : digits.startsWith("380")
      ? digits.slice(3)
      : digits.startsWith("0")
        ? digits.slice(1)
        : null;
  return national !== null && /^[1-9]\d{8}$/.test(national) ? `+380${national}` : null;
}

/**
 * Input side only. A write must carry a Ukrainian number, but stored rows and reveal outputs
 * keep the wider `E164Schema`: older contacts may be non-Ukrainian, and tightening what is read
 * back would make those rows fail output validation.
 */
const UaPhoneInputSchema = z
  .string()
  .transform((raw) => normalizeUaPhone(raw) ?? raw)
  .pipe(z.string().regex(UA_PHONE));

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

/** The authority as typed, so an `@` or a non-ASCII letter the parser would fold away still counts. */
const rawAuthorityOf = (value: string): string =>
  value.replace(/^[^:]*:\/*/, "").split(/[/?#]/, 1)[0] ?? "";

/**
 * @handle, a bare handle, instagram.com/<h>, https://(www.|m.)instagram.com/<h>[/][?...][#...]
 * -> "<h>" lowercased, or null. Shared by the form and the input schema.
 */
export function normalizeInstagram(raw: string): string | null {
  const value = raw.trim().replace(/^@/, "");
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (!hasScheme && !value.includes("/")) {
    const handle = value.toLowerCase();
    return INSTAGRAM_HANDLE.test(handle) ? handle : null;
  }
  const withScheme = hasScheme ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  const authority = rawAuthorityOf(withScheme);
  if (url.protocol !== "https:" || url.port !== "") return null;
  if (url.username !== "" || url.password !== "" || authority.includes("@")) return null;
  if ([...authority].some((char) => char.charCodeAt(0) > 0x7f)) return null;
  if (!INSTAGRAM_HOSTS.has(url.hostname)) return null;
  const segment = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1]?.toLowerCase();
  if (segment === undefined || INSTAGRAM_NOT_A_PROFILE.has(segment)) return null;
  return INSTAGRAM_HANDLE.test(segment) ? segment : null;
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
  if (donationUrlProblemOf(value) !== null || url.port !== "") return refuse;
  if (!FACEBOOK_HOSTS.has(url.hostname)) return refuse;
  if (!/^[A-Za-z0-9._\-/%]+$/.test(url.pathname)) return refuse;
  const path = url.pathname.replace(/\/+$/, "");
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

/** Always the canonical www host: an off-site URL cannot be stored as a Facebook contact. */
const FacebookUrlSchema = z.url({ protocol: /^https$/, hostname: /^www\.facebook\.com$/ });

/** Input side: typed Instagram forms become the bare lowercase handle. */
const InstagramInputSchema = z
  .string()
  .transform((raw) => normalizeInstagram(raw) ?? raw)
  .pipe(z.string().regex(INSTAGRAM_HANDLE));

/** Input side: only a URL the normaliser accepts is stored, and only in its canonical form. */
const FacebookInputSchema = z
  .string()
  .transform((raw) => {
    const normalized = normalizeFacebook(raw);
    return normalized.kind === "ok" ? normalized.url : raw;
  })
  .pipe(
    FacebookUrlSchema.refine((url) => {
      const again = normalizeFacebook(url);
      return again.kind === "ok" && again.url === url;
    }),
  );

/**
 * Channels are separate variants rather than a generic { type, value } pair
 * because each renders differently - tel:, mailto:, and two distinct deep-link
 * schemes. A generic pair would push a switch over a raw string into every
 * surface that displays a contact, which is the duplication this avoids.
 *
 * Telegram and Viber are first-class because they are the channels Ukrainian
 * shelters actually answer on.
 */
export const ContactChannelSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phone"), e164: E164Schema }),
  z.object({ kind: z.literal("email"), address: z.email() }),
  z.object({
    kind: z.literal("telegram"),
    handle: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  }),
  z.object({ kind: z.literal("viber"), e164: E164Schema }),
  z.object({ kind: z.literal("website"), url: z.url({ protocol: /^https$/ }) }),
  z.object({ kind: z.literal("instagram"), handle: z.string().regex(INSTAGRAM_HANDLE) }),
  z.object({ kind: z.literal("facebook"), url: FacebookUrlSchema }),
]);
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

const NORMALISED_ON_INPUT = new Set(["phone", "viber", "instagram", "facebook"]);

/**
 * `ContactChannelSchema` for writes: phone and Viber must be Ukrainian numbers, Instagram and
 * Facebook take their canonical forms (all normalised here).
 */
export const ContactChannelInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phone"), e164: UaPhoneInputSchema }),
  z.object({ kind: z.literal("viber"), e164: UaPhoneInputSchema }),
  z.object({ kind: z.literal("instagram"), handle: InstagramInputSchema }),
  z.object({ kind: z.literal("facebook"), url: FacebookInputSchema }),
  ...ContactChannelSchema.options.filter(
    (option) => !NORMALISED_ON_INPUT.has(option.shape.kind.value),
  ),
]);

export const ShelterContactSchema = z.object({
  primary: ContactChannelSchema,
  additional: z.array(ContactChannelSchema).readonly(),
});
export type ShelterContact = z.infer<typeof ShelterContactSchema>;

export const ShelterContactInputSchema = z.object({
  primary: ContactChannelInputSchema,
  additional: z.array(ContactChannelInputSchema).readonly(),
});

// In `../core` so the reveal dialog reaches it without zod.
export { allChannels } from "../core";
