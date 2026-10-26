import { z } from "zod";
import { ModeratorIdSchema, ShelterAdminIdSchema } from "../primitives/ids";

/**
 * Who acted on a shelter.
 *
 * Used only where a shelter's own administrator may legitimately act: pausing
 * and resuming (self-declared, `reasons.ts`), and asking for another review
 * after a rejection (H2-2). Every moderator-only event - start_review,
 * approve, reject, suspend, reinstate - keeps a bare `ModeratorId`, so a
 * shelter administrator can't even *construct* one of those, whatever a
 * handler gets wrong. Part of the kabinet's authorization lives in the type.
 */
export const ShelterActorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("moderator"), moderatorId: ModeratorIdSchema }),
  z.object({ kind: z.literal("shelter_admin"), shelterAdminId: ShelterAdminIdSchema }),
]);
export type ShelterActor = z.infer<typeof ShelterActorSchema>;
