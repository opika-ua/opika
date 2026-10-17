import { uk } from "@opika/i18n";

/**
 * K3's line that only Oleksii's allowlisted test shelter sees (CG-Q1): it
 * lives under `uk.kabinet.testShelterOnly.animalForm`, which only this folder
 * may read (`test-shelter-only.test.ts`). `AnimalForm` mounts it only when
 * the page's access decision is an allowlist write grant and the viewer is
 * the shelter's own admin (`allowlistLinesShown`), the rule `ShelterProfile`
 * follows for `AllowlistedShelterArea`.
 *
 * `DateUnchangedLine` is his final text, waiting here by his own note until
 * K2's confirmation buttons exist (PR 5). The two hidden-shelter lines that
 * sat here pending have his final text now (round 2b, answer 3) and render
 * from `animalForm.*` under every write grant.
 */
const lines = uk.kabinet.testShelterOnly.animalForm;

export function DateUnchangedLine({ className }: { className: string }) {
  return <p className={className}>{lines.dateUnchanged}</p>;
}
