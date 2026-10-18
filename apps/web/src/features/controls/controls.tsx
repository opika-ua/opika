import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * The shared controls (K4 is the first consumer; inbox K4-T12). Styled only
 * through theme tokens: the `rg-*` colours and radii, Tailwind's type and
 * spacing scale, and `--spacing-target` for the 48px minimum height every
 * control carries (`globals.css`). Oleksii, 2026-10-17: "styled only through
 * shared design tokens (colour, type, spacing) so the rebrand is a token
 * swap. No one-off styles in components." A rebrand edits the tokens and this
 * file, never a screen.
 *
 * Plain components, no hooks: a server page and a client form can both use
 * them. Existing screens keep their own class strings until a change touches
 * them (not migrated in PR 2).
 */

/** The one visible keyboard-focus indicator, on `:focus-visible` only. */
export const FOCUS_RING =
  "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-rg-registry";

export type ButtonVariant = "primary" | "secondary" | "text" | "icon";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "rounded-rg-button bg-rg-ink px-6 text-base font-medium text-rg-surface",
  secondary: "rounded-rg-button bg-rg-fill px-6 text-base font-medium text-rg-ink",
  text: "px-2 text-base text-rg-ink underline",
  /** A glyph-only control (a dialog's ✕); its name goes in `aria-label`. */
  icon: "w-target flex-none rounded-rg-button bg-rg-fill text-lg text-rg-ink",
};

export const buttonClass = (variant: ButtonVariant): string =>
  `inline-flex min-h-target items-center justify-center ${BUTTON[variant]} ${FOCUS_RING}`;

/**
 * Links that go somewhere rather than act (R-UI's operator screens first), on
 * the same 48px target and focus ring as the buttons. A link that looks like
 * a button uses `buttonClass` instead.
 *
 * `nav` and `chip` say which one is the current page with
 * `aria-current="page"`, and the current one is styled from that attribute,
 * so the markup that tells a screen reader where it is also decides what a
 * sighted person sees.
 */
export type LinkVariant = "text" | "nav" | "chip";

const LINK: Record<LinkVariant, string> = {
  /** An underlined link on its own line (S4's way back to the list). */
  text: "text-base text-rg-ink underline",
  /** An item of a page's nav. */
  nav: "rounded-rg-button px-4 text-base font-medium text-rg-ink aria-[current=page]:bg-rg-surface",
  /** One of a row of filter chips (S1's status filter). */
  chip: "rounded-rg-chip bg-rg-fill px-4 text-base text-rg-ink aria-[current=page]:bg-rg-ink aria-[current=page]:text-rg-surface",
};

export const linkClass = (variant: LinkVariant): string =>
  `inline-flex min-h-target items-center ${LINK[variant]} ${FOCUS_RING}`;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
}

const CONTROL = `min-h-target w-full min-w-0 rounded-rg-button bg-rg-fill px-4 text-lg text-rg-ink ${FOCUS_RING}`;
/** An invalid control: an inset ink ring, never a colour of its own. */
const INVALID = "ring-2 ring-inset ring-rg-ink";
const LABEL = "text-base font-medium text-rg-ink";
const HINT = "text-sm text-rg-ink-3";
const ERROR = "text-base font-medium text-rg-ink";

type FieldSlots = {
  id: string;
  label: ReactNode;
  /** Shown under the control and linked with `aria-describedby`. */
  hint?: ReactNode | undefined;
  /** The field's message; non-null marks the control invalid and links it. */
  error?: string | null | undefined;
  /** Extra ids the control is described by (a counter, a shared note). */
  describedBy?: readonly string[] | undefined;
};

function fieldA11y({ id, hint, error, describedBy = [] }: FieldSlots) {
  const ids = [
    ...(hint !== undefined ? [`${id}-hint`] : []),
    ...describedBy,
    ...(error ? [`${id}-error`] : []),
  ];
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": ids.length > 0 ? ids.join(" ") : undefined,
  } as const;
}

function FieldFrame({ slots, children }: { slots: FieldSlots; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={slots.id} className={LABEL}>
        {slots.label}
      </label>
      {children}
      {slots.error ? (
        <p id={`${slots.id}-error`} className={ERROR}>
          {slots.error}
        </p>
      ) : null}
      {slots.hint !== undefined ? (
        <div id={`${slots.id}-hint`} className={`flex flex-col gap-1 ${HINT}`}>
          {slots.hint}
        </div>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  describedBy,
  className = "",
  ...props
}: FieldSlots & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <input
        id={id}
        className={`${CONTROL} ${error ? INVALID : ""} ${className}`}
        {...fieldA11y(slots)}
        {...props}
      />
    </FieldFrame>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  describedBy,
  className = "",
  ref,
  ...props
}: FieldSlots &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { ref?: Ref<HTMLTextAreaElement> }) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <textarea
        id={id}
        ref={ref}
        className={`${CONTROL} min-h-30 resize-y py-3 ${error ? INVALID : ""} ${className}`}
        {...fieldA11y(slots)}
        {...props}
      />
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  describedBy,
  className = "",
  children,
  ...props
}: FieldSlots & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  const slots = { id, label, hint, error, describedBy };
  return (
    <FieldFrame slots={slots}>
      <select
        id={id}
        className={`${CONTROL} ${error ? INVALID : ""} ${className}`}
        {...fieldA11y(slots)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

/**
 * One option of a radio group (S2's legal form first). The whole row is the
 * label, so the touch target is the row, on the 48px token; the radio itself
 * takes the shared focus ring, since it is what holds focus. The group's
 * question is the surrounding `fieldset`'s `legend`, and its message is
 * linked there, so this stays one option and nothing more.
 */
export function RadioOption({
  label,
  className = "",
  ...props
}: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label
      className={`flex min-h-target items-center gap-3 rounded-rg-button bg-rg-fill px-4 ${className}`}
    >
      <input type="radio" className={FOCUS_RING} {...props} />
      <span className={LABEL}>{label}</span>
    </label>
  );
}
