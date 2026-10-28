import type { CoatColour } from "@opika/domain";
import { uk } from "./messages/uk";
import { fillTemplate } from "./template";

/**
 * A `Record` over the domain's colour type, so a colour added to
 * `COAT_COLOURS` without its word here fails to compile. One form per
 * colour, the neuter: it agrees with «забарвлення», and a colour has no sex.
 */
const COLOUR_NAMES: Record<CoatColour, string> = uk.coatColour.names;

/**
 * The colour on its own: the kabinet's choice of category. No longer a
 * gallery filter option - the gallery filter restructure removed colour as a
 * filter dimension; this export's remaining caller is the kabinet form.
 */
export function colourFilterLabel(colour: CoatColour): string {
  return COLOUR_NAMES[colour];
}

/** The colour on one animal's card: «Чорне забарвлення». */
export function colourChipLabel(colour: CoatColour): string {
  return fillTemplate(uk.coatColour.chip, { label: colourFilterLabel(colour) });
}
