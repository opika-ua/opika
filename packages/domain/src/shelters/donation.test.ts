import { describe, expect, it } from "vitest";
import { ShelterAdminIdSchema } from "../primitives/ids";
import { donationProviderOf, PendingDonationSchema } from "./donation";

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
