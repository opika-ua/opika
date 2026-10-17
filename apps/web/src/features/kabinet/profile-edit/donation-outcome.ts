import type { ShelterHistoryItemView } from "@opika/contracts";

/**
 * Whether K4 says the last proposed donation link was declined (K4 sheet,
 * answer 12, Oleksii, verbatim: "Not silence: show donation.declined once,
 * neutral, no reason given.").
 *
 * Derived from the shelter's own history, newest first, rather than stored:
 * the newest donation line decides. A rejection there means the operator's
 * answer to the latest proposal was no, and nothing has happened to the link
 * since. Proposing again (or cancelling, which only follows a proposal) puts a
 * newer line on top, so the message goes away by itself, which is what "once"
 * means here: one message for one decision, not a log of every past refusal.
 * No per-viewer "seen" state is kept (inbox K4-T3).
 */
export type DonationOutcome = { kind: "declined" } | { kind: "none" };

export function latestDonationOutcomeOf(
  newestFirst: readonly ShelterHistoryItemView[],
): DonationOutcome | null {
  for (const item of newestFirst) {
    switch (item.kind) {
      case "donation_decided":
        return item.decision === "rejected" ? { kind: "declined" } : { kind: "none" };
      case "donation_proposed":
      case "donation_proposal_cancelled":
        return { kind: "none" };
      default:
        continue;
    }
  }
  // No donation line in these items: the caller reads further, or stops.
  return null;
}
