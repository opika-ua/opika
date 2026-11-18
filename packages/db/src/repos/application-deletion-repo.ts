import type { ApplicationDeletionReason, ShelterId } from "@opika/domain";
import type { Database } from "../client";

/**
 * Deletes one application completely (D8, plan Agent 4): its user, organization, membership,
 * shelter, history, drafts and their photo rows, plus one `application_deletions` line, in one
 * transaction that re-checks the row is still due (`cleanupVerdictOf`'s SQL twin) or, for «Це не
 * я», still an application. Photos leave R2 through the existing clean-up job only (hard rule:
 * nothing else deletes R2 objects), once their rows are gone. Typed in Phase 0, so «Це не я»
 * (Agent 1) and the daily job (Agent 4) share one path.
 */
export type ApplicationDeletionOutcome =
  | { kind: "deleted"; shelterId: ShelterId; photoKeys: number }
  /** Not due any more (confirmed, decided, already gone): nothing was written. */
  | { kind: "not_due" };

export function applicationDeletionRepo(_db: Database) {
  return {
    async deleteApplication(
      _shelterId: ShelterId,
      _reason: ApplicationDeletionReason,
      _now: Date,
    ): Promise<ApplicationDeletionOutcome> {
      throw new Error("applicationDeletionRepo.deleteApplication is not served yet");
    },
  };
}
