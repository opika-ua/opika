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
  // Entries the shelter never sees (`evidence_added`) are dropped after the page is read, so a
  // page can come back short; keep reading while it is empty and more exist, so the shelter
  // never gets an empty page with a cursor.
  let after = input.after;
  for (;;) {
    const page = await kabinetShelterRepo(deps.db).historyPage({
      shelterId: scope.shelterId,
      after,
      limit: input.limit,
    });
    const items = page.items.flatMap((entry) => {
      const item = shelterFacingHistoryOf(entry, deps.operatorDisplayName);
      return item === null ? [] : [item];
    });
    if (items.length > 0 || page.next === null) {
      return { items, nextCursor: page.next === null ? null : encodeCursor(page.next) };
    }
    after = page.next;
  }
}
