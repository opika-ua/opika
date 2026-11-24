/**
 * How long a reveal and its contact snapshot are kept (Oleksii, 2026-11-20, privacy policy D2).
 * The policy's {revealDays} is this number.
 */
export const REVEAL_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A reveal made strictly before this instant is due; one exactly 90 days old is kept. */
export const revealRetentionCutoff = (now: Date): Date =>
  new Date(now.getTime() - REVEAL_RETENTION_DAYS * DAY_MS);
