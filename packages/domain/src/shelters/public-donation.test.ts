import { describe, expect, it } from "vitest";
import { ShelterAdminIdSchema } from "../primitives/ids";
import type { DonationLink, PendingDonation } from "./donation";
import { donationOnSuspension, publicDonationOf } from "./public-donation";

const LINK: DonationLink = { url: "https://send.monobank.ua/jar/live", provider: "monobank_jar" };
const NEWER: PendingDonation = {
  link: { url: "https://send.monobank.ua/jar/newer", provider: "monobank_jar" },
  proposedAt: new Date("2026-11-01T00:00:00.000Z"),
  proposedBy: ShelterAdminIdSchema.parse("44444444-4444-4444-8444-444444444444"),
};
const NOW = new Date("2026-11-06T10:00:00.000Z");

describe("publicDonationOf", () => {
  it.each(["verified", "paused"] as const)("shows the link for a %s shelter", (status) => {
    expect(publicDonationOf({ donation: LINK, verification: { status } })).toEqual(LINK);
  });

  it.each(["pending", "under_review", "rejected", "suspended"] as const)(
    "shows nothing for a %s shelter, whatever is stored",
    (status) => {
      expect(publicDonationOf({ donation: LINK, verification: { status } })).toBeNull();
    },
  );

  it("shows nothing when there is no link", () => {
    expect(publicDonationOf({ donation: null, verification: { status: "verified" } })).toBeNull();
  });
});

describe("donationOnSuspension", () => {
  it("has nothing to do without a live link", () => {
    expect(donationOnSuspension({ donation: null, pendingDonation: NEWER }, NOW)).toEqual({
      kind: "nothing_live",
    });
  });

  it("moves the live link to pending, from no one, when nothing newer waits", () => {
    expect(donationOnSuspension({ donation: LINK, pendingDonation: null }, NOW)).toEqual({
      kind: "moved_to_pending",
      previousLive: LINK,
      pendingDonation: { link: LINK, proposedAt: NOW, proposedBy: null },
    });
  });

  it("keeps a newer proposal and only records the old live link", () => {
    expect(donationOnSuspension({ donation: LINK, pendingDonation: NEWER }, NOW)).toEqual({
      kind: "pending_kept",
      previousLive: LINK,
    });
  });
});
