import {
  EARLY_LISTING_MAX_PERIODS,
  earlyListingExpiresAt,
  earlyListingOf,
  earlyListingRemaining,
  publicDonationOf,
  type Shelter,
  type ShelterHistoryEntry,
  type ShelterId,
} from "@opika/domain";

/** A history line the write just recorded, with the id the handler generated for it. */
export type HistoryLine = { id: string; entry: ShelterHistoryEntry };

/** What a write hands over once it has committed; the served route schedules it with `after()`. */
export type ShelterNotifier = (shelter: Shelter, lines: readonly HistoryLine[]) => void;

/** Operator mails go to every active operator; shelter mails to every member of the shelter. */
export type Audience = "operators" | "shelter_admins";

type Body =
  | { kind: "reviewRequested" }
  | { kind: "donationProposed"; host: string }
  | { kind: "earlyListingEnding"; expiresAt: Date; period: number }
  | { kind: "approved" }
  | { kind: "earlyListingAllowed"; expiresAt: Date }
  | { kind: "donationApproved"; host: string; shownNow: boolean }
  | { kind: "donationRejected"; host: string };

export type NotificationKind = Body["kind"];

/**
 * One mail to plan, before it knows its recipients. `dedupBase` plus a recipient is the claim
 * key (`dedupKeyOf`): `h:{historyId}` for a history line, `el-end:{shelterId}:{since}` for a period.
 */
export type NotificationIntent = Body & {
  audience: Audience;
  shelterId: ShelterId;
  shelterName: string;
  dedupBase: string;
};

const AUDIENCE: Record<NotificationKind, Audience> = {
  reviewRequested: "operators",
  donationProposed: "operators",
  earlyListingEnding: "operators",
  approved: "shelter_admins",
  earlyListingAllowed: "shelter_admins",
  donationApproved: "shelter_admins",
  donationRejected: "shelter_admins",
};

/** The link's host only: the full URL stays out of a mail kept in the provider's logs. */
const hostOf = (url: string): string => new URL(url).host;

type PlannedShelter = Pick<Shelter, "id" | "displayName" | "verification">;

function bodyOf(shelter: PlannedShelter, entry: ShelterHistoryEntry): Body | null {
  switch (entry.kind) {
    case "verification":
      if (entry.event.type === "approve") return { kind: "approved" };
      // The operator's own resubmit is his own action, not a request to him.
      if (entry.event.type === "resubmit" && entry.event.actor.kind === "shelter_admin") {
        return { kind: "reviewRequested" };
      }
      return null;
    case "donation_proposed":
      return entry.actor.kind === "shelter_admin"
        ? { kind: "donationProposed", host: hostOf(entry.link.url) }
        : null;
    case "early_listing_allowed":
      return { kind: "earlyListingAllowed", expiresAt: earlyListingExpiresAt(entry.at) };
    case "donation_decided": {
      const host = hostOf(entry.link.url);
      return entry.decision === "approved"
        ? {
            kind: "donationApproved",
            host,
            shownNow:
              publicDonationOf({ donation: entry.link, verification: shelter.verification }) !==
              null,
          }
        : { kind: "donationRejected", host };
    }
    default:
      return null;
  }
}

/**
 * The mails a committed write calls for. Pure: `shelter` is its state before the write (only
 * its name and status are read, and neither changes in the writes that send), `lines` are what
 * the write recorded. A lost race records nothing and so plans nothing.
 */
export function planEventIntents(
  shelter: PlannedShelter,
  lines: readonly HistoryLine[],
): NotificationIntent[] {
  return lines.flatMap(({ id, entry }) => {
    const body = bodyOf(shelter, entry);
    if (body === null) return [];
    return [
      {
        ...body,
        audience: AUDIENCE[body.kind],
        shelterId: shelter.id,
        shelterName: shelter.displayName,
        dedupBase: `h:${id}`,
      },
    ];
  });
}

/**
 * O4: the operator hears once per period, when 7 days or fewer are left (`remind`, the rule the
 * operator panel already uses). The key names the period's start, so a missed cron day or a
 * second run changes nothing and a second period is a new mail. `periodsUsed` is how many
 * allowances history holds; the running one is the last.
 */
export function planEarlyListingEnding(
  shelter: Shelter,
  periodsUsed: number,
  now: Date,
): NotificationIntent | null {
  const since = shelter.earlyListingSince;
  const remaining = earlyListingRemaining(shelter.verification, earlyListingOf(since), now);
  if (since === null || remaining.kind !== "running" || !remaining.remind) return null;
  return {
    kind: "earlyListingEnding",
    audience: AUDIENCE.earlyListingEnding,
    shelterId: shelter.id,
    shelterName: shelter.displayName,
    expiresAt: remaining.expiresAt,
    period: Math.min(Math.max(periodsUsed, 1), EARLY_LISTING_MAX_PERIODS),
    dedupBase: `el-end:${shelter.id}:${since.toISOString()}`,
  };
}
