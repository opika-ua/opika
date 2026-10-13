import { randomUUID } from "node:crypto";
import type { ModeratorId, Shelter, ShelterId } from "@opika/domain";
import type { Database } from "./client";
import { kabinetShelterRepo } from "./repos/kabinet-shelter-repo";

/**
 * History for data a script enters on a shelter's behalf (RG-Q8, Oleksii):
 * the shelter's own history must be complete for what the operator put in,
 * so `onboard-shelter.ts` and `seed.ts` write it too, with the operator as
 * actor. Scripts have no login; each passes the moderator id it already
 * records elsewhere (onboarding's founder stand-in, the seed's fixture).
 */
export type ScriptActor = { moderatorId: ModeratorId; now: Date };

/** The shelter and its `shelter_created` line (via `script`), as one statement. */
export async function insertShelterFromScript(
  db: Database,
  shelter: Shelter,
  by: ScriptActor,
): Promise<void> {
  await kabinetShelterRepo(db).createWithHistory(shelter, {
    id: randomUUID(),
    entry: { kind: "shelter_created", at: by.now, moderatorId: by.moderatorId, via: "script" },
  });
}

/**
 * One line per batch of new animals (RS-Q0: a count is fine for new animals
 * only; no script edits an existing animal, and one that ever does writes
 * per-animal entries instead). Nothing for an empty batch: zero is not an
 * import, and the entry's count is positive by schema.
 */
export async function recordAnimalsImported(
  db: Database,
  shelterId: ShelterId,
  count: number,
  by: ScriptActor,
): Promise<void> {
  if (count === 0) return;
  await kabinetShelterRepo(db).appendHistory({
    id: randomUUID(),
    shelterId,
    entry: { kind: "animals_imported", at: by.now, moderatorId: by.moderatorId, count },
  });
}
