import Image from "next/image";
import { cx } from "./cx";

/**
 * The only image component. `src` is a storage key or path; the global R2 loader
 * (`image-loader.ts`) turns it into the nearest pre-generated variant, never Vercel's optimiser.
 * `sizes` is required: a missing one makes the browser fetch the largest variant. A skeleton sits
 * behind the image so a slow photo (or none) never leaves a blank hole, and the box's aspect ratio
 * is fixed so nothing shifts on load. Mark the one above-the-fold (LCP) image `priority`: it
 * is preloaded and fetched at high priority, so mark one per page, never a row.
 */
const ASPECT = {
  card: "aspect-328/480",
  square: "aspect-square",
  wide: "aspect-3/2",
  portrait: "aspect-4/5",
  tall: "aspect-3/4",
} as const;

export type PhotoProps = {
  src: string | null;
  /** Empty string marks the photo decorative (the card's own text names the animal). */
  alt: string;
  sizes: string;
  aspect: keyof typeof ASPECT;
  priority?: boolean;
  className?: string;
};

export function Photo({ src, alt, sizes, aspect, priority = false, className }: PhotoProps) {
  return (
    <div className={cx("relative overflow-clip bg-line", ASPECT[aspect], className)}>
      {src === null ? null : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          fetchPriority={priority ? "high" : undefined}
          className="object-cover"
        />
      )}
    </div>
  );
}
