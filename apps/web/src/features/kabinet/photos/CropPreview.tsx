import { uk } from "@opika/i18n";
import { cx } from "../../../ui/cx";
import { Photo } from "../../../ui/Photo";
import { type ImagePart, partStyle, type SourceSize, thumbSquareOf } from "./crop-geometry";

const t = uk.kabinet.animalForm.photos;

/** `part` of the image filling a box whose shape `className` gives; empty until the cropper reports. */
function Framed({
  url,
  part,
  className,
}: {
  url: string;
  part: ImagePart | null;
  className: string;
}) {
  return (
    <div className={cx("relative overflow-clip bg-line", className)}>
      {part === null ? null : (
        <div className="absolute" style={partStyle(part)}>
          <Photo src={url} alt="" aspect="portrait" sizes="160px" className="size-full" />
        </div>
      )}
    </div>
  );
}

/**
 * What the frame gives, live: the 4:5 card photo at a phone gallery card's width and the 88 px
 * thumb (the square as wide as the frame). Decorative: the crop area is what a screen reader uses.
 */
export function CropPreview({
  url,
  part,
  size,
}: {
  url: string;
  part: ImagePart | null;
  size: SourceSize;
}) {
  return (
    <div aria-hidden="true" className="flex items-end gap-4">
      <div className="flex w-40 flex-col gap-1">
        <Framed url={url} part={part} className="aspect-4/5 w-full rounded-card" />
        <span className="text-caption text-ink-2">{t.cropPreview}</span>
      </div>
      <div className="flex w-22 flex-col gap-1">
        <Framed
          url={url}
          part={part === null ? null : thumbSquareOf(part, size)}
          className="size-22 rounded-field"
        />
        <span className="text-caption text-ink-2">{t.cropThumbPreview}</span>
      </div>
    </div>
  );
}
