import { uk } from "@opika/i18n";

/**
 * K3's lines that only Oleksii's allowlisted test shelter sees (CG-Q1): they
 * live under `uk.kabinet.testShelterOnly.animalForm`, which only this folder
 * may read (`test-shelter-only.test.ts`). `AnimalForm` mounts them only when
 * the page's access decision is an allowlist write grant and the viewer is
 * the shelter's own admin (`allowlistLinesShown`), the rule `ShelterProfile`
 * follows for `AllowlistedShelterArea`.
 *
 * - `DateUnchangedLine`: his final text, waiting here by his own note until
 *   K2's confirmation buttons exist (PR 5).
 * - `LastPhotoKeptHiddenText`: a `[COPY PENDING]` stand-in for
 *   `photos.lastPhotoKept` while the shelter's cards are hidden, where
 *   «бачать люди» would be false. Text only, so the photo section can place it
 *   in its note and in its status line.
 * - `PublishedNotShownText`: a `[COPY PENDING]` stand-in for `publish.done`
 *   in the same state, for the same reason («Тепер картку бачать…»). Text
 *   only, for the form's status line.
 */
const lines = uk.kabinet.testShelterOnly.animalForm;

export function DateUnchangedLine({ className }: { className: string }) {
  return <p className={className}>{lines.dateUnchanged}</p>;
}

export function LastPhotoKeptHiddenText() {
  return <>{lines.lastPhotoKeptNotShown}</>;
}

export function PublishedNotShownText() {
  return <>{lines.publishedNotShown}</>;
}
