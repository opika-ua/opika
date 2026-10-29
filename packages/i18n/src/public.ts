/**
 * What a client component on a public page may import: the adopter-facing catalogue
 * (`ukPublic`) and the label helpers, without `uk` (which would pull `forShelters` and the
 * kabinet, over half the strings, into the browser bundle). `index.ts` is the full surface.
 */
export {
  ageBucketLabel,
  ageWordFor,
  sexWordFor,
  sizeLabel,
  speciesWordFor,
} from "./animal-labels";
export { colourChipLabel, colourFilterLabel } from "./colour-labels";
export { COPY_PENDING, R4_2_ANALYTICS_SENTENCE, ukPublic } from "./messages/uk-public";
export { hromadaShort, type PlaceLabel, placeName, placeText } from "./place";
export { temperamentFilterLabel, temperamentLabelFor } from "./temperament-labels";
export { fillTemplate } from "./template";
