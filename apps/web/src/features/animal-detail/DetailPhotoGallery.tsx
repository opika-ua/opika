import type { AnimalPhoto } from "@opika/domain";
import { uk } from "@opika/i18n";
import { PhotoSlider } from "../../ui/PhotoSlider";

/** The card shows at most three photos (owner decision 7: native scroll-snap, no library). */
const MAX_PHOTOS = 3;

/**
 * The pet card's photo row on the kit's `PhotoSlider`: one 3:4 photo per slide (capped at 360px),
 * prev/next only when there is somewhere to scroll. `detail` R2 variant via the global loader.
 */
export function DetailPhotoGallery({
  photos,
  altFallback,
}: {
  photos: readonly AnimalPhoto[];
  /** `animal.name` - used when a photo's own `alt` is unset. */
  altFallback: string;
}) {
  return (
    <PhotoSlider
      photos={photos.slice(0, MAX_PHOTOS).map((photo) => ({
        src: photo.storageKey,
        alt: photo.alt?.uk ?? altFallback,
      }))}
      sizes="(max-width: 392px) calc(100vw - 32px), 360px"
      label={uk.detail.photoGalleryLabel}
      prevLabel={uk.detail.photoPrev}
      nextLabel={uk.detail.photoNext}
      aspect="tall"
      slide="full"
    />
  );
}
