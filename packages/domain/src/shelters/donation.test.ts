import { describe, expect, it } from "vitest";
import { ShelterAdminIdSchema } from "../primitives/ids";
import {
  DonationProposalUrlSchema,
  donationProviderOf,
  donationUrlProblemOf,
  PendingDonationSchema,
} from "./donation";

describe("donationProviderOf", () => {
  it.each([
    ["https://send.monobank.ua/jar/abc", "monobank_jar"],
    ["https://www.privatbank.ua/sendmoney?payment=1", "privatbank"],
    ["https://www.liqpay.ua/api/3/checkout?data=x", "liqpay"],
    ["https://pay.fondy.eu/s/abc", "fondy"],
    ["https://dobro.ua/projects/shelter", "other"],
  ] as const)("%s -> %s", (url, provider) => {
    expect(donationProviderOf(url)).toBe(provider);
  });

  it("ignores a port when recognising the provider", () => {
    expect(donationProviderOf("https://send.monobank.ua:8443/jar/abc")).toBe("monobank_jar");
  });

  /** Exact host or subdomain only: a lookalike that merely contains a known host is someone else's page. */
  it("doesn't mistake a lookalike host for a known provider", () => {
    expect(donationProviderOf("https://send.monobank.ua.evil.example/jar")).toBe("other");
    expect(donationProviderOf("https://notmonobank.ua/jar")).toBe("other");
  });
});

describe("PendingDonationSchema", () => {
  const proposedBy = ShelterAdminIdSchema.parse("44444444-4444-4444-8444-444444444444");

  it("holds the whole link approval would make live, plus who proposed it and when", () => {
    const pending = {
      link: { url: "https://send.monobank.ua/jar/new", provider: "monobank_jar" },
      proposedAt: new Date("2026-10-12T10:00:00.000Z"),
      proposedBy,
    };
    expect(PendingDonationSchema.parse(pending)).toEqual(pending);
  });

  /** The same rule as the live link: https only, so a proposal can never be a downgrade. */
  it("refuses a non-https link", () => {
    expect(
      PendingDonationSchema.safeParse({
        link: { url: "http://send.monobank.ua/jar/new", provider: "monobank_jar" },
        proposedAt: new Date(),
        proposedBy,
      }).success,
    ).toBe(false);
  });
});

describe("donationUrlProblemOf", () => {
  it.each([
    ["https://send.monobank.ua/jar/abc"],
    ["https://pay.example.org:8443/domivka?a=b@c"],
    ["https://example.org/path@still-path"],
  ])("accepts %s", (url) => {
    expect(donationUrlProblemOf(url)).toBeNull();
    expect(DonationProposalUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    ["https://user@send.monobank.ua/jar"],
    ["https://send.monobank.ua@evil.example/jar"],
    ["https://send.monobank.ua:443@evil.example/"],
    ["https://user:secret@example.org/"],
    ["https://@example.org/"],
    ["  https://user@example.org/  "],
  ])("refuses userinfo in %s", (url) => {
    expect(donationUrlProblemOf(url)).toBe("userinfo");
    expect(DonationProposalUrlSchema.safeParse(url.trim()).success).toBe(false);
  });

  it.each([
    ["https://xn--monobank-9ve.ua/jar"],
    ["https://send.xn--80ak6aa92e.com/"],
    ["https://XN--e1afmkfd.xn--p1ai/"],
    ["https://%78n--e1afmkfd.com/"],
    // Cyrillic "о" and "а" in place of Latin ones: the classic lookalike.
    ["https://send.mоnobаnk.ua/jar"],
    ["https://банка.укр/"],
  ])("refuses an IDN or punycode host: %s", (url) => {
    expect(donationUrlProblemOf(url)).toBe("idn");
    expect(DonationProposalUrlSchema.safeParse(url).success).toBe(false);
  });

  it("does not take a non-ASCII path or query for a host", () => {
    expect(donationUrlProblemOf("https://example.org/притулок")).toBeNull();
  });

  it("leaves a string that is not a URL to the URL schema", () => {
    expect(donationUrlProblemOf("not a url")).toBeNull();
    expect(DonationProposalUrlSchema.safeParse("not a url").success).toBe(false);
  });
});
