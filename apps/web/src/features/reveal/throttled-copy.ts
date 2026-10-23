import { uk } from "@opika/i18n";

/**
 * What a per-IP 429 shows on the reveal dialog and the deck's error card
 * (audit 2026-10-22, G1): `detail.rateLimited`, the sentence the animal page
 * already uses for the same refusal, and the plain retry label, since the limit
 * clears by itself. No eyebrow and no body: it says nothing about the card or
 * the site, because neither is at fault.
 */
export const THROTTLED_COPY = {
  title: uk.detail.rateLimited,
  action: uk.errors.offline.action,
} as const;
