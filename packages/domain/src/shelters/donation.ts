import { z } from "zod";
import { ShelterAdminIdSchema } from "../primitives/ids";

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

/**
 * Which provider a donation URL belongs to, from its host: K4 offers a single
 * URL field, so a shelter proposing a link never picks a provider. Hosts this
 * doesn't know are `other`, never refused: a shelter's own payment page is
 * legitimate whatever runs it.
 *
 * Matched on the exact host or a subdomain of it, never a substring test, so
 * `monobank.ua.example.com` is not mistaken for monobank.
 */
const PROVIDER_HOSTS: ReadonlyArray<readonly [string, DonationProvider]> = [
  ["send.monobank.ua", "monobank_jar"],
  ["monobank.ua", "monobank_jar"],
  ["privatbank.ua", "privatbank"],
  ["liqpay.ua", "liqpay"],
  ["fondy.eu", "fondy"],
  ["fondy.ua", "fondy"],
];

export const donationProviderOf = (url: string): DonationProvider => {
  // `hostname`, not `host`: a port (`:8443`) is not part of who runs the page.
  const host = new URL(url).hostname.toLowerCase();
  const match = PROVIDER_HOSTS.find(([known]) => host === known || host.endsWith(`.${known}`));
  return match?.[1] ?? "other";
};

/**
 * A donation link a shelter has proposed and the operator hasn't approved yet
 * (H2, KABINET N20). The live `Shelter.donation` is untouched until approval:
 * a swapped donation link on a compromised shelter account is this product's
 * realistic fraud vector, and the live link is the one adopters trust because
 * it was verified.
 *
 * Carries the whole `DonationLink` that approval would make live, provider
 * included, so the operator approves exactly what goes out. One proposal at a
 * time per shelter; proposing again replaces it (inbox H2-7).
 */
export const PendingDonationSchema = z.object({
  link: DonationLinkSchema,
  proposedAt: z.date(),
  proposedBy: ShelterAdminIdSchema,
});
export type PendingDonation = z.infer<typeof PendingDonationSchema>;
