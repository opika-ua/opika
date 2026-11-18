import type { ShelterHistoryEntry, ShelterVerification } from "@opika/domain";

/**
 * Stored shapes from before 0028, read as today's. 0028 backfills both, but code still running
 * from before it can write the old shapes between the production migration and the deploy, so
 * every read normalises (owner, 2026-11-18): the backfills are a safety net, not the guarantee.
 * Applied in the columns' `fromDriver`, so no read path can miss it.
 */

/** A rejection with no `stage` refused a verification: the application stage did not exist. */
export function withRejectionStage(verification: ShelterVerification): ShelterVerification {
  if (verification.status !== "rejected") return verification;
  const stored = verification as unknown as { stage?: unknown };
  return stored.stage === undefined ? { ...verification, stage: "verification" } : verification;
}

/** A rename line with a bare `moderatorId` and no actor was the operator's. */
export function withRenameActor(entry: ShelterHistoryEntry): ShelterHistoryEntry {
  if (entry.kind !== "display_name_changed") return entry;
  const stored = entry as unknown as {
    at: Date;
    actor?: unknown;
    moderatorId?: string;
    from: string;
    to: string;
  };
  if (stored.actor !== undefined || stored.moderatorId === undefined) return entry;
  return {
    kind: "display_name_changed",
    at: stored.at,
    actor: { kind: "moderator", moderatorId: stored.moderatorId as never },
    from: stored.from,
    to: stored.to,
  };
}
