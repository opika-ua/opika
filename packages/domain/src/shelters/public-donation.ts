import type { DonationLink, PendingDonation } from "./donation";
import type { Shelter } from "./shelter";

/**
 * The only door from a shelter's stored link to anything a visitor sees. An approved link is
 * shown only while the shelter stands verified (or paused, which is verified with a closed
 * door); an early listing, a review, a rejection or a suspension shows none. A second place
 * that reads `shelter.donation` for a public view would reopen that hole.
 */
export const publicDonationOf = (
  shelter: Pick<Shelter, "donation"> & { verification: Pick<Shelter["verification"], "status"> },
): DonationLink | null =>
  shelter.verification.status === "verified" || shelter.verification.status === "paused"
    ? shelter.donation
    : null;

/**
 * What a suspension does to the stored link, decided with the suspend itself so the two land in
 * one write. The live link stops being live and reinstating never revives it. Nothing newer
 * waiting: it moves to pending, for the operator to approve again in one click. A newer proposal
 * waiting: that one stays, and the old link is only recorded.
 */
export type DonationOnSuspension =
  | { kind: "nothing_live" }
  | { kind: "moved_to_pending"; previousLive: DonationLink; pendingDonation: PendingDonation }
  | { kind: "pending_kept"; previousLive: DonationLink };

export const donationOnSuspension = (
  shelter: Pick<Shelter, "donation" | "pendingDonation">,
  now: Date,
): DonationOnSuspension => {
  const previousLive = shelter.donation;
  if (previousLive === null) return { kind: "nothing_live" };
  if (shelter.pendingDonation !== null) return { kind: "pending_kept", previousLive };
  return {
    kind: "moved_to_pending",
    previousLive,
    pendingDonation: { link: previousLive, proposedAt: now, proposedBy: null },
  };
};
