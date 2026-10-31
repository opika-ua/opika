import type { AnimalSpecies } from "@opika/domain";
import { uk } from "@opika/i18n";
import { Mascot } from "../../ui/Mascot";

/** The closing line of the last gallery page; the mascot walks on it, right of centre. */
export function GalleryListEnd({ mascotKind }: { mascotKind: AnimalSpecies }) {
  return (
    <div data-testid="gallery-list-end" className="relative mt-10 border-t-2 border-line pt-3">
      {mascotKind === "dog" ? (
        <Mascot kind="dog" pose="stand" size={64} perch="top-right" offset={32} />
      ) : (
        <Mascot kind="cat" pose="stand" variant="tail" size={64} perch="top-right" offset={32} />
      )}
      <p className="text-center text-body text-ink-2">{uk.feed.listEnd}</p>
    </div>
  );
}
