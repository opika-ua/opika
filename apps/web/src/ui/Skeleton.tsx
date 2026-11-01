import { cx } from "./cx";

/**
 * A loading placeholder shaped like what will arrive (so nothing shifts). Decorative: the container
 * that loads carries `aria-busy`. The pulse stops under reduced motion.
 */
const SHAPE = {
  line: "h-4 w-full rounded-tag",
  block: "w-full rounded-panel",
  circle: "size-10 rounded-pill",
} as const;

export type SkeletonProps = {
  shape: keyof typeof SHAPE;
  /** Layout only: width, height, aspect ratio. */
  className?: string;
};

export function Skeleton({ shape, className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cx("animate-pulse bg-line motion-reduce:animate-none", SHAPE[shape], className)}
    />
  );
}
