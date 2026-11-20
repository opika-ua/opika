/**
 * How long a reveal (with its shelter-contact and exact-address snapshot) is kept. Oleksii,
 * 2026-11-20, privacy policy D2: "90 days. Small PR: delete reveals (and orphaned adopters rows)
 * older than 90 days in the 6-hourly cron". The policy's {revealDays} is this number.
 */
export const REVEAL_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A reveal made strictly before this instant is due; one exactly 90 days old is kept. */
export const revealRetentionCutoff = (now: Date): Date =>
  new Date(now.getTime() - REVEAL_RETENTION_DAYS * DAY_MS);

/** The rule the clean-up's SQL applies (`revealRepo.deleteExpired`), for one reveal. */
export const isRevealExpired = (revealedAt: Date, now: Date): boolean =>
  revealedAt.getTime() < revealRetentionCutoff(now).getTime();
