import { z } from "zod";
import {
  isCanonicalFacebookUrl,
  isInstagramHandle,
  normalizeFacebook,
  normalizeInstagram,
} from "./contact-links";

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

/** A typed contact value past this length is refused before any normaliser or parser runs. */
export const CONTACT_INPUT_MAX_LENGTH = 2048;
const capped = z.string().max(CONTACT_INPUT_MAX_LENGTH);

/**
 * Input side only. A write must carry a Ukrainian number, but stored rows and reveal outputs
 * keep the wider `E164Schema`: older contacts may be non-Ukrainian, and tightening what is read
 * back would make those rows fail output validation.
 */
const UaPhoneInputSchema = capped
  .transform((raw) => normalizeUaPhone(raw) ?? raw)
  .pipe(z.string().regex(UA_PHONE));

/**
 * Read and write alike: only a URL already in its own canonical form, so a row written past the
 * input schema (a redirector, userinfo, a port) is refused on read too.
 */
const FacebookUrlSchema = z
  .url({ protocol: /^https$/, hostname: /^www\.facebook\.com$/ })
  .refine(isCanonicalFacebookUrl);

/** A route name (`explore`, `p`, ...) is refused here as in the URL form. */
const InstagramHandleSchema = z.string().refine(isInstagramHandle);

/** Input side: typed Instagram forms become the bare lowercase handle. */
const InstagramInputSchema = capped
  .transform((raw) => normalizeInstagram(raw) ?? raw)
  .pipe(InstagramHandleSchema);

/** Input side: only a URL the normaliser accepts is stored, and only in its canonical form. */
const FacebookInputSchema = capped
  .transform((raw) => {
    const normalized = normalizeFacebook(raw);
    return normalized.kind === "ok" ? normalized.url : raw;
  })
  .pipe(FacebookUrlSchema);

const TelegramHandleSchema = z.string().regex(/^[A-Za-z0-9_]{5,32}$/);
const WebsiteUrlSchema = z.url({ protocol: /^https$/ });

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
  z.object({ kind: z.literal("telegram"), handle: TelegramHandleSchema }),
  z.object({ kind: z.literal("viber"), e164: E164Schema }),
  z.object({ kind: z.literal("website"), url: WebsiteUrlSchema }),
  z.object({ kind: z.literal("instagram"), handle: InstagramHandleSchema }),
  z.object({ kind: z.literal("facebook"), url: FacebookUrlSchema }),
  z.object({ kind: z.literal("whatsapp"), e164: E164Schema }),
  /** An application form the shelter asks adopters to fill in; any https host, like a website. */
  z.object({ kind: z.literal("form"), url: WebsiteUrlSchema }),
]);
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

/**
 * `ContactChannelSchema` for writes: phone, Viber and WhatsApp must be Ukrainian numbers, Instagram and
 * Facebook take their canonical forms (all normalised here); every value is length-capped first.
 */
export const ContactChannelInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phone"), e164: UaPhoneInputSchema }),
  z.object({ kind: z.literal("viber"), e164: UaPhoneInputSchema }),
  z.object({ kind: z.literal("email"), address: capped.pipe(z.email()) }),
  z.object({ kind: z.literal("telegram"), handle: capped.pipe(TelegramHandleSchema) }),
  z.object({ kind: z.literal("website"), url: capped.pipe(WebsiteUrlSchema) }),
  z.object({ kind: z.literal("instagram"), handle: InstagramInputSchema }),
  z.object({ kind: z.literal("facebook"), url: FacebookInputSchema }),
  z.object({ kind: z.literal("whatsapp"), e164: UaPhoneInputSchema }),
  z.object({ kind: z.literal("form"), url: capped.pipe(WebsiteUrlSchema) }),
]);

export const ShelterContactSchema = z.object({
  primary: ContactChannelSchema,
  additional: z.array(ContactChannelSchema).readonly(),
});
export type ShelterContact = z.infer<typeof ShelterContactSchema>;

/** «Other» channels the editor adds beside its phone, Telegram and form fields (owner, 2026-11-11). */
export const MAX_OTHER_CONTACTS = 4;
/** Telegram and the form have their own fields, so the additional list holds them and the others. */
export const MAX_ADDITIONAL_CHANNELS = MAX_OTHER_CONTACTS + 2;
/** The cap's refusal, matched by the editor to say which rule it broke (as the display name's is). */
export const CONTACT_TOO_MANY_CHANNELS_MESSAGE = `A contact holds at most ${MAX_ADDITIONAL_CHANNELS} additional channels`;

/**
 * On a write a form is never the primary (the reveal must always offer a way to call or write),
 * there is at most one (one questionnaire), and the list is capped. Reads stay permissive.
 */
export const ShelterContactInputSchema = z.object({
  primary: ContactChannelInputSchema.refine((channel) => channel.kind !== "form"),
  additional: z
    .array(ContactChannelInputSchema)
    .max(MAX_ADDITIONAL_CHANNELS, { message: CONTACT_TOO_MANY_CHANNELS_MESSAGE })
    .readonly()
    .refine((channels) => channels.filter((channel) => channel.kind === "form").length <= 1),
});

// In `../core` so the reveal dialog reaches them without zod.
export {
  allChannels,
  type FacebookNormalized,
  isCanonicalFacebookUrl,
  normalizeFacebook,
  normalizeInstagram,
} from "../core";
