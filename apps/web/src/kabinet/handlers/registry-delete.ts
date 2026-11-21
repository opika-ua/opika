import type { apiErrors, ShelterDeletionCounts, ShelterDeletionResult } from "@opika/contracts";
import { applicationDeletionRepo } from "@opika/db/repos";
import type { ModeratorId, ShelterId } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { KabinetContext } from "../context";

type NotFound = ORPCErrorConstructorMap<{ NOT_FOUND: typeof apiErrors.NOT_FOUND }>;
type DeleteDeps = Pick<KabinetContext, "db" | "now">;

/** «Видалити притулок»: the counts the dialog shows when it opens (owner, 2026-11-20). */
export async function registryDeletionCounts(
  deps: DeleteDeps,
  input: { shelterId: ShelterId },
  errors: NotFound,
): Promise<ShelterDeletionCounts> {
  const counts = await applicationDeletionRepo(deps.db).deletionCounts(input.shelterId);
  if (counts === null) throw errors.NOT_FOUND();
  return counts;
}

/**
 * Deletes a shelter for good (owner, 2026-11-20: any shelter). The router lets only the operator
 * reach this (`$meta(registry)`); the repository re-checks the grant, the name and the counts
 * under its lock. Every public page reads per request (`force-dynamic`, no cache tags), so the
 * shelter, its animals, its city listings and the sitemap stop showing them with the commit.
 */
export async function registryDeleteShelter(
  deps: DeleteDeps,
  moderatorId: ModeratorId,
  input: { shelterId: ShelterId; typedName: string; counts: ShelterDeletionCounts },
  errors: NotFound,
): Promise<ShelterDeletionResult> {
  const outcome = await applicationDeletionRepo(deps.db).deleteShelterByOperator(
    {
      shelterId: input.shelterId,
      typedName: input.typedName,
      counts: input.counts,
      operatorUserId: moderatorId,
    },
    deps.now,
  );
  switch (outcome.kind) {
    case "deleted":
      // Ids and counts only: the name stays out of the logs.
      // biome-ignore lint/suspicious/noConsole: the operator's one irreversible act, for the logs
      console.info(
        `[registry] shelter ${input.shelterId} deleted by ${moderatorId}: line ${outcome.deletionId}, ${outcome.photoKeys} photo key(s) left for the clean-up job, ${outcome.erasedAccounts} account(s) erased, ${outcome.keptAccounts} kept`,
      );
      return { kind: "deleted", name: input.typedName.trim() };
    case "counts_changed":
      return { kind: "counts_changed", counts: outcome.counts };
    case "name_mismatch":
      return { kind: "name_mismatch" };
    case "not_found":
      throw errors.NOT_FOUND();
    case "not_operator":
      // The router admitted a super_admin whose grant is gone by the time of the lock.
      throw new Error(`registry.shelters.delete: ${moderatorId} holds no active operator grant`);
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = outcome;
      throw new Error(`Unhandled deletion outcome ${JSON.stringify(unreachable)}`);
    }
  }
}
