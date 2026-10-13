import type { KabinetCursor, ShelterHistoryItemView } from "@opika/contracts";
import { kabinetShelterRepo } from "@opika/db/repos";
import { shelterFacingHistoryOf } from "@opika/domain";
import type { ShelterReadScope } from "../access";
import type { KabinetContext } from "../context";

/**
 * The shelter's own history (RG-Q8), projected for the shelter: no evidence,
 * no moderator ids, the operator shown by display name. Reads only (RS-Q1).
 */
export async function historyList(
  deps: Pick<KabinetContext, "db" | "operatorDisplayName">,
  scope: ShelterReadScope,
  input: { after: { at: Date; id: string } | null; limit: number },
  encodeCursor: (position: { at: Date; id: string }) => KabinetCursor,
): Promise<{ items: ShelterHistoryItemView[]; nextCursor: KabinetCursor | null }> {
  const page = await kabinetShelterRepo(deps.db).historyPage({
    shelterId: scope.shelterId,
    ...input,
  });
  return {
    items: page.items.map((entry) => shelterFacingHistoryOf(entry, deps.operatorDisplayName)),
    nextCursor: page.next === null ? null : encodeCursor(page.next),
  };
}
