import type { ApplicationDecisionResult, ApplicationsQueueView, apiErrors } from "@opika/contracts";
import type { ApplicationRejectionReason, ModeratorId, ShelterId } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { KabinetContext } from "../context";

/**
 * The operator's «Заявки» block (§3), typed in Phase 0 and served by the operator-queue PR
 * (Agent 2). Until then each answers a loud error, never an empty queue that reads as "nothing to
 * do". Decide with `acceptApplication` / `rejectApplication` (domain), writing conditionally on
 * the status read, with the shelter's version as every S4 form does.
 */
export type ApplicationsDeps = Pick<KabinetContext, "db" | "now" | "newId" | "notify">;

type DecisionErrors = ORPCErrorConstructorMap<{ CONFLICT: typeof apiErrors.CONFLICT }>;

const notServedYet = (procedure: string): never => {
  throw new Error(`registry.applications.${procedure} is not served yet`);
};

export async function applicationsList(
  _deps: ApplicationsDeps,
  _moderatorId: ModeratorId,
): Promise<ApplicationsQueueView> {
  return notServedYet("list");
}

export async function applicationsAccept(
  _deps: ApplicationsDeps,
  _moderatorId: ModeratorId,
  _input: { shelterId: ShelterId; expectedVersion: number },
  _errors: DecisionErrors,
): Promise<ApplicationDecisionResult> {
  return notServedYet("accept");
}

export async function applicationsReject(
  _deps: ApplicationsDeps,
  _moderatorId: ModeratorId,
  _input: { shelterId: ShelterId; expectedVersion: number; reason: ApplicationRejectionReason },
  _errors: DecisionErrors,
): Promise<ApplicationDecisionResult> {
  return notServedYet("reject");
}
