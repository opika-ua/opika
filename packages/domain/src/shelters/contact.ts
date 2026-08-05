import { z } from "zod";

const E164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/);

/**
 * Channels are separate variants rather than a generic { type, value } pair
 * because each renders differently — tel:, mailto:, and two distinct deep-link
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

export const ShelterContactSchema = z.object({
  primary: ContactChannelSchema,
  additional: z.array(ContactChannelSchema).readonly(),
});
export type ShelterContact = z.infer<typeof ShelterContactSchema>;

export const allChannels = (contact: ShelterContact): readonly ContactChannel[] => [
  contact.primary,
  ...contact.additional,
];
