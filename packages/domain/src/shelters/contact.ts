import { z } from "zod";

const E164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/);

/** The Ukrainian shape: +380 and nine digits. Spaces, dashes, dots and brackets are not part of it. */
const UA_PHONE = /^\+380\d{9}$/;

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
  return national !== null && /^\d{9}$/.test(national) ? `+380${national}` : null;
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
]);
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

/** `ContactChannelSchema` for writes: phone and Viber must be Ukrainian numbers (normalised here). */
export const ContactChannelInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phone"), e164: UaPhoneInputSchema }),
  z.object({ kind: z.literal("viber"), e164: UaPhoneInputSchema }),
  ...ContactChannelSchema.options.filter(
    (option) => option.shape.kind.value !== "phone" && option.shape.kind.value !== "viber",
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

export const allChannels = (contact: ShelterContact): readonly ContactChannel[] => [
  contact.primary,
  ...contact.additional,
];
