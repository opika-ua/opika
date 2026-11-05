import type { ShelterVerification, VerificationStatus } from "./state";

/**
 * Listing before verification (owner, 2026-11-04): the operator may let a shelter's cards be
 * public, labelled, while its review runs. It sits BESIDE the verification state machine, in its
 * own column (`shelters.early_listing_since`): allow and revoke are audited operator toggles, not
 * `VerificationEvent`s, so the FSM table is untouched.
 */

/** One period, an instant sum with no calendar maths. The one source for every reader. */
export const EARLY_LISTING_DAYS = 60;

/** An allowance, then one renewal with a written reason; a third is refused (owner, 2026-11-04). */
export const EARLY_LISTING_MAX_PERIODS = 2;

/** The only statuses the permission can act in; elsewhere a stored value is ignored. */
export const EARLY_LISTING_STATUSES = [
  "pending",
  "under_review",
] as const satisfies readonly VerificationStatus[];

const isEarlyStatus = (status: VerificationStatus): boolean =>
  (EARLY_LISTING_STATUSES as readonly string[]).includes(status);

const DAY_MS = 24 * 60 * 60 * 1000;

export type EarlyListing = { kind: "not_allowed" } | { kind: "allowed"; since: Date };

export const earlyListingOf = (since: Date | null): EarlyListing =>
  since === null ? { kind: "not_allowed" } : { kind: "allowed", since };

export const earlyListingExpiresAt = (since: Date): Date =>
  new Date(since.getTime() + EARLY_LISTING_DAYS * DAY_MS);

/**
 * The instant a stored `since` must be after to still count at `now`. SQL compares against this
 * same value, so the strict boundary (`now < since + 60d`) cannot drift between the two.
 */
export const earlyListingCutoff = (now: Date): Date =>
  new Date(now.getTime() - EARLY_LISTING_DAYS * DAY_MS);

/** Derived at read, never stored. No `now` parameter default: expiry is a read-time rule. */
export type PublicListingBasis =
  | { kind: "verified" }
  | { kind: "listed_before_verification"; since: Date; expiresAt: Date }
  | { kind: "not_listed"; why: "status" | "not_allowed" | "expired" };

export function publicListingBasisOf(
  verification: ShelterVerification,
  early: EarlyListing,
  now: Date,
): PublicListingBasis {
  if (verification.status === "verified") return { kind: "verified" };
  if (!isEarlyStatus(verification.status)) return { kind: "not_listed", why: "status" };
  if (early.kind === "not_allowed") return { kind: "not_listed", why: "not_allowed" };
  const expiresAt = earlyListingExpiresAt(early.since);
  // Strict: at the boundary instant the shelter is already hidden (fail safe).
  if (now.getTime() >= expiresAt.getTime()) return { kind: "not_listed", why: "expired" };
  return { kind: "listed_before_verification", since: early.since, expiresAt };
}

/** The SQL's twin on the denormalised columns; the parity test holds the two together. */
export const publicListingBasisOfColumns = (
  status: VerificationStatus,
  earlyListingSince: Date | null,
  now: Date,
): "verified" | "listed_before_verification" | "not_listed" => {
  if (status === "verified") return "verified";
  if (!isEarlyStatus(status) || earlyListingSince === null) return "not_listed";
  return earlyListingSince.getTime() > earlyListingCutoff(now).getTime()
    ? "listed_before_verification"
    : "not_listed";
};

/** What a public surface may say about a listed shelter: a label, never a date. */
export const PUBLIC_LISTING_LABELS = ["verified", "listed_before_verification"] as const;
export type PublicListingLabel = (typeof PUBLIC_LISTING_LABELS)[number];

export const publicListingLabelOf = (basis: PublicListingBasis): PublicListingLabel | null =>
  basis.kind === "not_listed" ? null : basis.kind;

export const isPubliclyListed = (basis: PublicListingBasis): boolean => basis.kind !== "not_listed";

/**
 * Whether a verification change keeps the stored permission. Only moves inside the open statuses
 * do (`start_review`, an evidence add); approve, reject and resubmit leave it, so the repo clears
 * the column for them. The SQL in `kabinet-shelter-repo.ts` is this rule.
 */
export const keepsEarlyListing = (from: VerificationStatus, to: VerificationStatus): boolean =>
  isEarlyStatus(from) && isEarlyStatus(to);

/** The least evidence that lets the operator allow (owner, 2026-11-04): a visit or a reference. */
export const EARLY_LISTING_EVIDENCE_KINDS = ["site_visit", "reference_contact"] as const;

export type AllowEarlyListingResult =
  | { kind: "ok"; since: Date; period: number }
  | { kind: "wrong_status"; from: VerificationStatus }
  | { kind: "already_running" }
  | { kind: "evidence_below_minimum" }
  | { kind: "limit_reached" }
  | { kind: "note_required" };

/**
 * `periodsUsed` counts earlier allowances from history. A permission whose period has run out may
 * be allowed again (it is the second period); a running one may not be restacked. The second
 * period needs a written reason, the third is refused.
 */
export function allowEarlyListing(input: {
  verification: ShelterVerification;
  early: EarlyListing;
  periodsUsed: number;
  note: string | null;
  now: Date;
}): AllowEarlyListingResult {
  const { verification, early, periodsUsed, note, now } = input;
  if (verification.status !== "pending" && verification.status !== "under_review") {
    return { kind: "wrong_status", from: verification.status };
  }
  if (publicListingBasisOf(verification, early, now).kind === "listed_before_verification") {
    return { kind: "already_running" };
  }
  const hasMinimum = verification.evidence.items.some((item) =>
    (EARLY_LISTING_EVIDENCE_KINDS as readonly string[]).includes(item.kind),
  );
  if (!hasMinimum) return { kind: "evidence_below_minimum" };
  if (periodsUsed >= EARLY_LISTING_MAX_PERIODS) return { kind: "limit_reached" };
  if (periodsUsed >= 1 && (note === null || note.trim() === "")) return { kind: "note_required" };
  return { kind: "ok", since: now, period: periodsUsed + 1 };
}

export type RevokeEarlyListingResult = { kind: "ok" } | { kind: "not_running" };

/** Revoking acts on a running permission only; a lapsed one is already hidden. */
export function revokeEarlyListing(
  verification: ShelterVerification,
  early: EarlyListing,
  now: Date,
): RevokeEarlyListingResult {
  return publicListingBasisOf(verification, early, now).kind === "listed_before_verification"
    ? { kind: "ok" }
    : { kind: "not_running" };
}

/**
 * When a stored permission ran out on its own, so the next write that clears the column can
 * record it with `at = expiresAt` (not the write's time). `null` while it still runs or is unset.
 */
export const lapsedAtOf = (early: EarlyListing, now: Date): Date | null => {
  if (early.kind === "not_allowed") return null;
  const expiresAt = earlyListingExpiresAt(early.since);
  return now.getTime() >= expiresAt.getTime() ? expiresAt : null;
};
