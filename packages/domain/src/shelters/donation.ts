import { z } from "zod";

/**
 * A flat enumeration rather than a union: this is a classification with no
 * per-variant payload, and inventing empty variants to satisfy a convention
 * would be following the letter of the rule against its purpose. It becomes a
 * union the moment one provider needs a field the others do not.
 */
export const DonationProviderSchema = z.enum([
  "monobank_jar",
  "privatbank",
  "liqpay",
  "fondy",
  "other",
]);
export type DonationProvider = z.infer<typeof DonationProviderSchema>;

/**
 * A link and nothing else. No account number, no token, no amount — the
 * absence of stored payment data is what keeps a future payment provider an
 * addition rather than a retrofit, so it is enforced by the type.
 */
export const DonationLinkSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  provider: DonationProviderSchema,
});
export type DonationLink = z.infer<typeof DonationLinkSchema>;

/**
 * Derived rather than stored: the destination shown to a user must be the
 * destination they are sent to, and a second field can disagree with the link
 * it describes.
 */
export const donationHost = (link: DonationLink): string => new URL(link.url).host;
