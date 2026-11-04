import { z } from "zod";
import { type PauseCode, PauseCodeSchema } from "./reasons";
import type { ShelterVerification } from "./state";

/**
 * What a visitor may learn about a shelter's availability: open, or paused with the closed reason
 * code. Never the note, the actor or the date; labels live in the public catalogue.
 */
export const ShelterAvailabilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("open") }),
  z.object({ kind: z.literal("paused"), reason: PauseCodeSchema }),
]);
export type ShelterAvailability = z.infer<typeof ShelterAvailabilitySchema>;

/**
 * `null` means the shelter's pages must answer as unknown. A suspension from a pause is `null` too:
 * the pause kept in `priorState` must not surface, or suspended would be told apart from missing.
 */
export const shelterAvailabilityOf = (state: ShelterVerification): ShelterAvailability | null => {
  switch (state.status) {
    case "verified":
      return { kind: "open" };
    case "paused":
      return { kind: "paused", reason: state.reason.code satisfies PauseCode };
    case "pending":
    case "under_review":
    case "rejected":
    case "suspended":
      return null;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
};
