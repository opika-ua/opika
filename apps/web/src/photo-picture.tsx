"use client";

import { getImageProps } from "next/image";
import { preload } from "react-dom";
import opikaImageLoader, { avifPhotoLoader } from "./image-loader";

type PhotoPictureProps = {
  src: string;
  alt: string;
  sizes: string;
  priority: boolean;
  eager: boolean;
};

/**
 * `Photo`'s AVIF form: an AVIF source with the WebP `<img>` as the fallback for a browser without
 * AVIF (iOS 15). A client component so both srcsets go into the HTML once, not again into the RSC
 * payload; the loaders are passed explicitly, so both srcsets come from the same variant ladder.
 */
export function PhotoPicture({ src, alt, sizes, priority, eager }: PhotoPictureProps) {
  const { props: img } = getImageProps({
    src,
    alt,
    fill: true,
    sizes,
    loader: opikaImageLoader,
    loading: priority || eager ? "eager" : "lazy",
    fetchPriority: priority ? "high" : eager ? "low" : undefined,
    className: "object-cover",
  });
  const { props: avif } = getImageProps({ src, alt, fill: true, sizes, loader: avifPhotoLoader });
  if (priority) {
    // React skips its auto-preload inside `<picture>`, and a WebP preload would fetch a file an AVIF
    // browser never shows; a browser without AVIF ignores this one by its type.
    preload(avif.src, {
      as: "image",
      imageSrcSet: avif.srcSet,
      imageSizes: sizes,
      fetchPriority: "high",
      type: "image/avif",
    });
  }
  return (
    <picture>
      <source type="image/avif" srcSet={avif.srcSet} sizes={sizes} />
      <img {...img} alt={alt} />
    </picture>
  );
}
