import type { AnimalId, ModeratorId, ReportId, ShelterId } from "../primitives/ids";
import type { ReportDraft } from "./draft";
import type { ReportKind } from "./kind";

export type ReportStatus =
  | { kind: "open" }
  | { kind: "resolved"; at: Date; by: ModeratorId }
  | { kind: "dismissed"; at: Date; by: ModeratorId };

/**
 * There is no reporter field, on purpose: reports are anonymous. The comment
 * is nullable because it is erased after retention, so a Report is not a draft.
 */
export type Report = {
  id: ReportId;
  animalId: AnimalId;
  /** Denormalised so the operator queue needs no join to group by shelter. */
  shelterId: ShelterId;
  kind: ReportKind;
  comment: string | null;
  createdAt: Date;
  status: ReportStatus;
};

export const newReport = (
  draft: ReportDraft,
  context: { id: ReportId; animalId: AnimalId; shelterId: ShelterId; at: Date },
): Report => ({
  id: context.id,
  animalId: context.animalId,
  shelterId: context.shelterId,
  kind: draft.kind,
  comment: draft.comment ?? null,
  createdAt: context.at,
  status: { kind: "open" },
});
