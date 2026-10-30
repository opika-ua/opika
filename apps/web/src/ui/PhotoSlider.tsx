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
const SLIDE = {
  peek: "w-4/5 max-w-90",
  full: "w-full max-w-90",
  // Below desktop one photo is the whole row, edge to edge, capped in height (`max-h-photo`); desktop
  // keeps the 3:4 `full` slide.
  hero: "w-full desktop:max-w-90 desktop:aspect-3/4 max-h-photo desktop:max-h-none",
} as const;

export type PhotoSliderItem = { src: string; alt: string };

export type PhotoSliderProps = {
  photos: readonly PhotoSliderItem[];
  /** The `sizes` of one slide, as for Photo. */
  sizes: string;
  /** Names the scrolling region. */
  label: string;
  prevLabel: string;
  nextLabel: string;
  /** Photo proportions; `portrait` (4:5) by default, `tall` (3:4) for the pet card. */
  aspect?: "portrait" | "tall";
  /**
   * `peek`: 80% wide so the next slide shows. `full`: one slide fills the row (still capped at 360px).
   * `hero`: below desktop the slides fill the row edge to edge, square-cornered, with dots and an
   * «N/M» counter; from desktop it is `full`.
   */
  slide?: "peek" | "full" | "hero";
  /** `hero` only: names the counter, `{n}` and `{total}` filled in («Фото {n} з {total}»). */
  counterTemplate?: string;
  className?: string;
};

export function PhotoSlider({
  photos,
  sizes,
  label,
  prevLabel,
  nextLabel,
  aspect = "portrait",
  slide = "peek",
  counterTemplate,
  className,
}: PhotoSliderProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [current, setCurrent] = useState(0);

  const measure = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    setCanPrev(node.scrollLeft > 0);
    setCanNext(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
    setCurrent(node.clientWidth === 0 ? 0 : Math.round(node.scrollLeft / node.clientWidth));
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
    // A jump, not a glide, for visitors who asked the system for less motion.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({
      left: direction * node.clientWidth * 0.9,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  if (photos.length === 0) return null;
  const hero = slide === "hero";
  const counted = hero && photos.length > 1;
  const counterName = (counterTemplate ?? "")
    .replace("{n}", String(current + 1))
    .replace("{total}", String(photos.length));
  // On a phone the arrows are for keyboard users: out of sight until focused, since touch swipes.
  const arrowPhone = hero ? "max-desktop:sr-only max-desktop:focus:not-sr-only" : "";
  return (
    <div className={cx("relative", className)}>
      <section
        ref={scrollerRef}
        onScroll={measure}
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be focusable so a keyboard user can scroll it.
        tabIndex={0}
        className={cx(
          "flex snap-x snap-mandatory overflow-x-auto motion-safe:scroll-smooth focus-ring [scrollbar-width:none]",
          hero
            ? "max-desktop:rounded-none desktop:gap-4 desktop:rounded-card"
            : "gap-4 rounded-card",
        )}
      >
        {photos.map((photo, index) => (
          <Photo
            key={`${index}-${photo.src}`}
            src={photo.src}
            alt={photo.alt}
            sizes={sizes}
            aspect={aspect}
            priority={index === 0}
            className={cx(
              SLIDE[slide],
              "flex-none snap-start",
              hero ? "desktop:rounded-card" : "rounded-card",
            )}
          />
        ))}
      </section>
      {canPrev ? (
        <Button
          variant="icon"
          aria-label={prevLabel}
          onClick={() => step(-1)}
          className={cx("absolute top-1/2 left-3 -translate-y-1/2", arrowPhone)}
        >
          <Icon name="chevron-left" />
        </Button>
      ) : null}
      {canNext ? (
        <Button
          variant="icon"
          aria-label={nextLabel}
          onClick={() => step(1)}
          className={cx("absolute top-1/2 right-3 -translate-y-1/2", arrowPhone)}
        >
          <Icon name="chevron-right" />
        </Button>
      ) : null}
      {counted ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 desktop:hidden"
          >
            {photos.map((photo, index) => (
              <span
                key={`${index}-${photo.src}`}
                className={cx(
                  "h-1.5 rounded-pill bg-surface shadow-float",
                  index === current ? "w-5" : "w-1.5 opacity-70",
                )}
              />
            ))}
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 bottom-3 rounded-pill bg-ink px-2 text-caption text-on-ink desktop:hidden"
          >
            {current + 1}/{photos.length}
          </span>
          <span role="status" aria-live="polite" className="sr-only">
            {counterName}
          </span>
        </>
      ) : null}
    </div>
  );
}
