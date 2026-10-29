import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

export type TextLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** `inline` (default) sits in prose; `standalone` is a link on its own line and gets the 48px target. */
  placement?: "inline" | "standalone";
};

/**
 * An inline link inside prose. Underlined (colour alone is not the cue). The 48px target is
 * met by the surrounding text block's line box, not by padding, so it does not break lines.
 */
export function TextLink({ className, placement = "inline", ...props }: TextLinkProps) {
  return (
    <Link
      className={cx(
        "cursor-pointer text-ink underline underline-offset-4 focus-ring",
        placement === "standalone" && "inline-flex min-h-target items-center",
        className,
      )}
      {...props}
    />
  );
}
