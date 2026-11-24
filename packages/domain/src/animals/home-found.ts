import type { AnimalListingState } from "./listing";

/** How long an adopted animal's own page says «уже вдома» before it is the 404 again (owner, 2026-11-24). */
export const HOME_FOUND_PAGE_DAYS = 90;

const MS_PER_DAY = 86_400_000;

/**
 * Whether the animal's page shows the «Уже вдома» state: only an adoption less than
 * `HOME_FOUND_PAGE_DAYS` old. Every other listing is "gone", the 404 as before; the gallery and
 * every list keep excluding adopted animals regardless (commitment 6).
 */
export function homeFoundPageOf(listing: AnimalListingState, now: Date): "show" | "gone" {
  if (listing.kind !== "adopted") return "gone";
  const until = listing.adoptedAt.getTime() + HOME_FOUND_PAGE_DAYS * MS_PER_DAY;
  return until > now.getTime() ? "show" : "gone";
}
