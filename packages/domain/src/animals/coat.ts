import { z } from "zod";

/**
 * A bucket, like size (decision 3), closed at two values: what an adopter
 * filters on is "long or short", not a measurement or a breed term. A third
 * value (hairless, wire) is an additive literal the exhaustiveness checks turn
 * into a guided edit, the same reasoning as species (decision 8).
 *
 * Never a listing fact and never a completeness input: an animal whose fur
 * isn't recorded is complete as it stands («Не записано»), and `/prytulkam`
 * §3 names exactly what ranks a card (commitment 1), which fur is not.
 */
export const CoatLengthSchema = z.enum(["short", "long"]);
export type CoatLength = z.infer<typeof CoatLengthSchema>;

export const COAT_LENGTHS = ["short", "long"] as const satisfies readonly CoatLength[];
