import type { KabinetShelterView } from "@opika/contracts";
import type { ListingKind } from "@opika/domain";

/**
 * What a self-registered shelter is told at the top of its list (spec §2, Q3, P0-1). Pure: the
 * view, the inventory counts and the signed-in address decide it. An operator-created shelter and
 * the support view get none, so their page reads as it did before self-registration.
 */
export type ApplicationBanner =
  | { kind: "pending" }
  | { kind: "confirm_email"; email: string }
  | { kind: "approved"; shelterId: string }
  | { kind: "days_left"; daysLeft: number };

/** Every kind a card can leave a draft for: once any exists, the shelter has published. */
const PUBLISHED_ONCE: readonly ListingKind[] = ["published", "reserved", "adopted", "withdrawn"];

export function applicationBannersOf(
  shelter: Pick<KabinetShelterView, "id" | "verification" | "earlyListing" | "registration">,
  counts: Readonly<Record<ListingKind, number>>,
  viewer: "admin" | "support",
  email: string | null,
  /** This browser closed «Притулок схвалено» for this shelter (`approved-dismissal.ts`). */
  approvedDismissed = false,
): ApplicationBanner[] {
  if (viewer === "support" || shelter.registration.source !== "self_registration") return [];
  const { status } = shelter.verification;
  if (status === "application") {
    const banners: ApplicationBanner[] = [{ kind: "pending" }];
    if (shelter.registration.email === "unconfirmed" && email !== null) {
      banners.push({ kind: "confirm_email", email });
    }
    return banners;
  }
  const banners: ApplicationBanner[] = [];
  // Approved, and nothing published yet: «Тепер можна публікувати» is still the news.
  const accepted = status === "pending" || status === "under_review" || status === "verified";
  if (!approvedDismissed && accepted && PUBLISHED_ONCE.every((kind) => counts[kind] === 0)) {
    banners.push({ kind: "approved", shelterId: shelter.id });
  }
  const early = shelter.earlyListing;
  if ((status === "pending" || status === "under_review") && early.kind === "running") {
    banners.push({ kind: "days_left", daysLeft: early.daysLeft });
  }
  return banners;
}

/** The publish gate as the kabinet sees it: the server's `publishGateOf` decides; this only says why. */
export const awaitingApproval = (shelter: Pick<KabinetShelterView, "verification">): boolean =>
  shelter.verification.status === "application";
