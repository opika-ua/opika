import type { ButtonHTMLAttributes, Ref } from "react";
import { Button as KitButton, buttonClass as kitButtonClass } from "../../ui/Button";
import { Chip, chipClass } from "../../ui/Chip";
import { cx } from "../../ui/cx";

/**
 * TEMPORARY compatibility layer. The shared controls were absorbed into `src/ui` (DS PR 2); this
 * file only re-exports them under their old names and maps the old button variants onto the kit's,
 * so no consumer breaks. It is deleted when the last consumer imports from `src/ui` directly (the
 * kabinet migration). New code imports `src/ui`, never this file.
 */
export {
  Checkbox as CheckboxOption,
  CONTROL,
  ERROR,
  HINT,
  INVALID,
  LABEL,
  Radio as RadioOption,
  type Segment,
  SegmentedControl,
  Select as SelectField,
  TextArea as TextAreaField,
  TextField,
} from "../../ui/form";

export type ButtonVariant = "primary" | "secondary" | "text" | "icon" | "chip";

const KIT_VARIANT = {
  primary: "primary",
  secondary: "secondary",
  text: "ghost",
  icon: "icon",
  chip: "secondary",
} as const;

export const buttonClass = (variant: ButtonVariant): string =>
  variant === "chip"
    ? cx(
        chipClass(false),
        "focus-ring aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-ink",
      )
    : kitButtonClass(KIT_VARIANT[variant]);

export type LinkVariant = "text" | "nav" | "chip";

const LINK: Record<LinkVariant, string> = {
  text: "text-body text-ink underline",
  nav: "rounded-field px-4 text-label text-ink current:bg-surface",
  chip: "rounded-pill border-2 border-line bg-page px-4 text-label text-ink current:bg-ink current:text-on-ink",
};

export const linkClass = (variant: LinkVariant): string =>
  `inline-flex min-h-target items-center ${LINK[variant]} focus-ring`;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}) {
  if (variant === "chip") {
    const { children, "aria-pressed": pressed, ...rest } = props;
    return (
      <Chip
        kind="toggle"
        pressed={pressed === true || pressed === "true"}
        type={type}
        {...(className === undefined ? {} : { className })}
        {...rest}
      >
        {children}
      </Chip>
    );
  }
  if (variant === "icon") {
    const { "aria-label": ariaLabel = "", ...rest } = props;
    return (
      <KitButton
        variant="icon"
        aria-label={ariaLabel}
        type={type}
        ref={ref}
        {...(className === undefined ? {} : { className })}
        {...rest}
      />
    );
  }
  return (
    <KitButton
      variant={KIT_VARIANT[variant]}
      type={type}
      ref={ref}
      {...(className === undefined ? {} : { className })}
      {...props}
    />
  );
}
