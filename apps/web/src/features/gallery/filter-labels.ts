import { uk } from "@opika/i18n";

/**
 * The temperament and colour filter groups' names, «Характер» and
 * «Забарвлення»: the kabinet form's own section titles for the same two
 * fields, his approved copy (PC1-D2), read from there rather than written out
 * a second time under `filters.*`. No new Ukrainian, and the gallery and the
 * form can't drift into two names for one field.
 *
 * The one place a public page reads a `kabinet.*` string; DR1-S3-T3 kept fur's
 * public words in keys of their own. If the form's titles ever need to differ
 * from the filters', the fix is two `filters.*` keys holding these words,
 * replacing the two lines below.
 */
export const TEMPERAMENT_GROUP_LABEL: string = uk.kabinet.animalForm.temperament.title;
export const COLOUR_GROUP_LABEL: string = uk.kabinet.animalForm.colour.title;
