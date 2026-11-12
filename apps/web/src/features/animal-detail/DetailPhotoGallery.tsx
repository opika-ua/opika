import type { AnimalPhoto } from "@opika/domain";
import { uk } from "@opika/i18n";
import { PhotoSlider } from "../../ui/PhotoSlider";

/**
 * Edge to edge below desktop: the panel pads its content, so the photo pulls back out by the same
 * amount, and comes first on a phone whatever its place in the markup (`order-first`).
 */
const BLEED = "-mx-4 tablet:-mx-6 order-first desktop:mx-0 desktop:order-none";

/** The pet card's photos on the kit's `PhotoSlider` (`hero`); the first is the one priority image. */
export function DetailPhotoGallery({
  photos,
  altFallback,
  slot,
}: {
  photos: readonly AnimalPhoto[];
  /** `animal.name` - used when a photo's own `alt` is unset. */
  altFallback: string;
  /** Its place on the sheet's desktop grid: the columns it spans («1-4») and their classes. */
  slot?: { columns: string; className: string } | null;
}) {
  // The overlay watches this marker leave the top of its scroll to swap its floating controls for
  // the compact bar; it sits on the photo's bottom edge.
  const photoEnd = (
    <span aria-hidden="true" data-photo-end className="absolute inset-x-0 bottom-0 h-px" />
  );
  if (photos.length === 0) {
    return (
      <div
        data-testid="photo-placeholder"
        className={`${BLEED} relative flex h-75 items-center justify-center bg-line px-4 text-center desktop:hidden`}
      >
        <span className="text-body text-ink-2">{uk.errors.photoMissing.placeholder}</span>
        {photoEnd}
      </div>
    );
  }
  return (
    <div data-columns={slot?.columns} className={`${BLEED} relative ${slot?.className ?? ""}`}>
      <PhotoSlider
        photos={photos.map((photo) => ({
          src: photo.storageKey,
          alt: photo.alt?.uk ?? altFallback,
        }))}
        sizes="(max-width: 599px) 100vw, (max-width: 1023px) 640px, 300px"
        label={uk.detail.photoGalleryLabel}
        prevLabel={uk.detail.photoPrev}
        nextLabel={uk.detail.photoNext}
        counterTemplate={uk.detail.photoCounter}
        rowPrevLabel={uk.detail.photoRowPrev}
        rowNextLabel={uk.detail.photoRowNext}
        rowCounterTemplate={uk.detail.photoRowCounter}
        aspect="portrait"
        slide="hero"
      />
      {photoEnd}
    </div>
  );
}
