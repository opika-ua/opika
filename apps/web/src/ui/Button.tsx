import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode, Ref } from "react";
import { cx } from "./cx";

/**
 * The one button. Replaces controls.Button, CircleButton, PillButton and the deck's ActionButton.
 * `cursor-pointer` is explicit: Tailwind's preflight resets buttons to `cursor: default`.
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "icon";
export type ButtonSize = "md" | "lg";
export type ButtonStatus = "idle" | "loading";

const BASE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-label focus-ring disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "rounded-pill bg-ink text-on-ink",
  accent: "rounded-pill bg-accent text-on-ink",
  secondary: "rounded-pill border-2 border-ink bg-transparent text-ink",
  ghost: "rounded-pill bg-transparent text-ink underline-offset-4 hover:underline",
  icon: "rounded-pill bg-surface text-ink shadow-float",
};

// md is 48px (the target floor); lg is 64px on desktop and stays 52px on a phone.
const SIZE: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: {
    md: "min-h-target px-6",
    lg: "min-h-13 px-6 desktop:min-h-16 desktop:px-11 desktop:text-body-l desktop:font-semibold",
  },
  accent: {
    md: "min-h-target px-6",
    lg: "min-h-13 px-6 desktop:min-h-16 desktop:px-11 desktop:text-body-l desktop:font-semibold",
  },
  secondary: {
    md: "min-h-target px-6",
    lg: "min-h-13 px-6 desktop:min-h-16 desktop:px-11 desktop:text-body-l desktop:font-semibold",
  },
  ghost: { md: "min-h-target px-3", lg: "min-h-13 px-4" },
  icon: { md: "size-target", lg: "size-13" },
};

/** The class string, for the rare element that cannot be a Button or LinkButton. */
export function buttonClass(variant: ButtonVariant, size: ButtonSize = "md"): string {
  return cx(BASE, VARIANT[variant], SIZE[variant][size]);
}

type Common = {
  size?: ButtonSize;
  /** `loading` keeps the label, sets aria-busy and ignores presses (still focusable). */
  status?: ButtonStatus;
  children?: ReactNode;
};

type TextVariantProps = { variant?: Exclude<ButtonVariant, "icon"> };
/** A glyph-only button has no text to name it, so a name is required. */
type IconVariantProps = { variant: "icon"; "aria-label": string };

export type ButtonProps = Common &
  (TextVariantProps | IconVariantProps) &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    ref?: Ref<HTMLButtonElement> | undefined;
  };

export function Button({
  variant = "primary",
  size = "md",
  status = "idle",
  className,
  type = "button",
  onClick,
  ref,
  ...props
}: ButtonProps) {
  const loading = status === "loading";
  return (
    <button
      ref={ref}
      // While loading the press must do nothing, not even submit: a plain button without the handler
      // (no inline handler either, so this stays usable from a server component).
      type={loading ? "button" : type}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cx(buttonClass(variant, size), className)}
      {...props}
    />
  );
}

export type LinkButtonProps = Omit<Common, "status"> &
  (TextVariantProps | IconVariantProps) &
  Omit<ComponentProps<typeof Link>, "children" | "href"> & { href: string };

/** A link that looks like a Button: navigation stays a real `<a>`, so it works without JS. */
export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: LinkButtonProps) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}
