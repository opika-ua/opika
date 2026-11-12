import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode, Ref } from "react";
import { cx } from "./cx";

/**
 * The one button. Replaces controls.Button, CircleButton, PillButton.
 * `cursor-pointer` is explicit: Tailwind's preflight resets buttons to `cursor: default`.
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "icon";
/** The glyph button on a photo. Kept out of `ButtonVariant` so `Exclude<ButtonVariant, "icon">` stays the text looks. */
type Variant = ButtonVariant | "scrim";
export type ButtonSize = "md" | "lg";
export type ButtonStatus = "idle" | "loading";

const LAYOUT = "inline-flex shrink-0 items-center justify-center gap-2";
// The accent label is its own type token (19px bold, at every breakpoint): pure white on accent-strong is 4.0:1,
// which passes WCAG 1.4.3 only as large text. It replaces text-label rather than stacking on it.
const look = (variant: Variant) => `${LAYOUT} ${variant === "accent" ? "text-cta" : "text-label"}`;
const BASE_BEHAVIOUR =
  "cursor-pointer focus-ring disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const VARIANT: Record<Variant, string> = {
  primary: "rounded-pill bg-ink text-on-ink",
  accent: "rounded-pill bg-accent-strong text-on-accent-strong",
  secondary: "rounded-pill border-2 border-ink bg-transparent text-ink",
  ghost: "rounded-pill bg-transparent text-ink underline-offset-4 hover:underline",
  // The surface and page tokens are near-identical, so the shadow alone leaves the circle invisible on
  // the page; the ink-2 edge keeps it above 3:1 (WCAG 1.4.11) on a page and on a photo alike.
  icon: "rounded-pill border border-ink-2 bg-surface text-ink shadow-float",
  // On a photo: the fill stops at the content box, so a 40px dark circle sits in the 48px target.
  scrim: "rounded-pill bg-ink/70 bg-clip-content p-1 text-on-ink hover:bg-ink/85",
};

// md is 48px (the target floor); lg is 64px on desktop and stays 52px on a phone.
const SIZE: Record<Variant, Record<ButtonSize, string>> = {
  primary: {
    md: "min-h-target px-6",
    lg: "min-h-13 px-6 desktop:min-h-16 desktop:px-11 font-bold desktop:text-body-l",
  },
  accent: {
    md: "min-h-target px-6",
    lg: "min-h-13 px-6 desktop:min-h-16 desktop:px-11",
  },
  secondary: {
    md: "min-h-target px-6",
    lg: "min-h-13 px-6 desktop:min-h-16 desktop:px-11 font-bold desktop:text-body-l",
  },
  ghost: { md: "min-h-target px-3", lg: "min-h-13 px-4 font-bold" },
  icon: { md: "size-target", lg: "size-13" },
  scrim: { md: "size-target", lg: "size-13" },
};

/** The class string, for the rare element that cannot be a Button or LinkButton. */
export function buttonClass(variant: Variant, size: ButtonSize = "md"): string {
  return cx(look(variant), BASE_BEHAVIOUR, VARIANT[variant], SIZE[variant][size]);
}

/** A button's look with none of its behaviour classes, for a decorative `<span aria-hidden>` that only looks like one (a card's pill); fewer classes per card. */
export function buttonLookClass(variant: Variant, size: ButtonSize = "md"): string {
  return cx(look(variant), VARIANT[variant], SIZE[variant][size]);
}

type Common = {
  size?: ButtonSize;
  /** `loading` keeps the label, sets aria-busy and ignores presses (still focusable). */
  status?: ButtonStatus;
  children?: ReactNode;
};

type TextVariantProps = { variant?: Exclude<ButtonVariant, "icon"> };
/** A glyph-only button has no text to name it, so a name is required. */
type IconVariantProps = { variant: "icon" | "scrim"; "aria-label": string };

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
