import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * The one frame of the site header and the kabinet header: full width, a fluid gutter, an inner
 * cap wide enough that the logo sits at the same x on both at every viewport. Page content keeps
 * `Container`'s narrower cap; only header rows use this.
 */
export function HeaderFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("mx-auto w-full max-w-header px-header-gutter", className)}>{children}</div>
  );
}
