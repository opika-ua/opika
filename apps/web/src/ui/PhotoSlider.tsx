"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Photo } from "./Photo";

/**
 * A row of photos that scroll sideways and snap (CSS scroll-snap, so touch swiping is the browser's
 * own and works without JS). Prev and next buttons appear only when there is somewhere to scroll,
 * stepping by most of the visible width. The scroller is a named region and keyboard-focusable
 * (arrow keys scroll it natively). Slides use the kit's `Photo`: fixed aspect, R2 variants, `sizes`.
 */
export type PhotoSliderItem = { src: string; alt: string };

export type PhotoSliderProps = {
  photos: readonly PhotoSliderItem[];
  /** The `sizes` of one slide, as for Photo. */
  sizes: string;
  /** Names the scrolling region. */
  label: string;
  prevLabel: string;
  nextLabel: string;
  className?: string;
};

export function PhotoSlider({
  photos,
  sizes,
  label,
  prevLabel,
  nextLabel,
  className,
}: PhotoSliderProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const measure = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    setCanPrev(node.scrollLeft > 0);
    setCanNext(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
  }, []);

  useEffect(() => {
    measure();
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  const step = (direction: 1 | -1) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.9, behavior: "smooth" });
  };

  if (photos.length === 0) return null;
  return (
    <div className={cx("relative", className)}>
      <section
        ref={scrollerRef}
        onScroll={measure}
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be focusable so a keyboard user can scroll it.
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth rounded-card focus-ring [scrollbar-width:none]"
      >
        {photos.map((photo, index) => (
          <Photo
            key={`${index}-${photo.src}`}
            src={photo.src}
            alt={photo.alt}
            sizes={sizes}
            aspect="portrait"
            priority={index === 0}
            className="w-4/5 max-w-90 flex-none snap-start rounded-card"
          />
        ))}
      </section>
      {canPrev ? (
        <Button
          variant="icon"
          aria-label={prevLabel}
          onClick={() => step(-1)}
          className="absolute top-1/2 left-3 -translate-y-1/2"
        >
          <Icon name="chevron-left" />
        </Button>
      ) : null}
      {canNext ? (
        <Button
          variant="icon"
          aria-label={nextLabel}
          onClick={() => step(1)}
          className="absolute top-1/2 right-3 -translate-y-1/2"
        >
          <Icon name="chevron-right" />
        </Button>
      ) : null}
    </div>
  );
}
