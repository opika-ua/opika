import type { ReactNode } from "react";
import { cx } from "./cx";
import { Checkbox, FieldError, FieldHint, LABEL, Radio } from "./form";

/**
 * A question with a set of options, as a `fieldset` with a `legend` (the group's name for screen
 * readers). Uncontrolled by default (`defaultValue`), so it submits with a plain form and works in a
 * server component; pass `value` and `onChange` from a client component to control it. CheckboxGroup
 * submits repeated `name=value` pairs (what a GET filter form turns into repeated query params).
 */
export type GroupOption = { value: string; label: ReactNode };

type GroupBase = {
  name: string;
  legend: ReactNode;
  options: readonly GroupOption[];
  hint?: ReactNode | undefined;
  error?: string | null | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
};

function Frame({
  name,
  legend,
  hint,
  error,
  disabled,
  className,
  children,
}: Pick<GroupBase, "name" | "legend" | "hint" | "error" | "disabled" | "className"> & {
  children: ReactNode;
}) {
  const ids = [
    ...(hint !== undefined ? [`${name}-hint`] : []),
    ...(error ? [`${name}-error`] : []),
  ];
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={ids.length > 0 ? ids.join(" ") : undefined}
      aria-invalid={error ? true : undefined}
      className={cx("flex min-w-0 flex-col gap-2", className)}
    >
      <legend className={cx(LABEL, "mb-2")}>{legend}</legend>
      {children}
      {error ? <FieldError id={`${name}-error`}>{error}</FieldError> : null}
      {hint !== undefined ? <FieldHint id={`${name}-hint`}>{hint}</FieldHint> : null}
    </fieldset>
  );
}

export type RadioGroupProps = GroupBase &
  (
    | { defaultValue?: string; value?: undefined; onChange?: undefined }
    | { value: string | null; onChange: (value: string) => void; defaultValue?: undefined }
  );

export function RadioGroup({
  name,
  legend,
  options,
  hint,
  error,
  disabled,
  className,
  ...state
}: RadioGroupProps) {
  return (
    <Frame {...{ name, legend, hint, error, disabled, className }}>
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          value={option.value}
          label={option.label}
          {...(state.value === undefined
            ? { defaultChecked: state.defaultValue === option.value }
            : {
                checked: state.value === option.value,
                onChange: () => state.onChange(option.value),
              })}
        />
      ))}
    </Frame>
  );
}

export type CheckboxGroupProps = GroupBase &
  (
    | { defaultValue?: readonly string[]; value?: undefined; onChange?: undefined }
    | { value: readonly string[]; onChange: (value: string[]) => void; defaultValue?: undefined }
  );

export function CheckboxGroup({
  name,
  legend,
  options,
  hint,
  error,
  disabled,
  className,
  ...state
}: CheckboxGroupProps) {
  return (
    <Frame {...{ name, legend, hint, error, disabled, className }}>
      {options.map((option) => (
        <Checkbox
          key={option.value}
          name={name}
          value={option.value}
          label={option.label}
          {...(state.value === undefined
            ? { defaultChecked: state.defaultValue?.includes(option.value) ?? false }
            : {
                checked: state.value.includes(option.value),
                onChange: (event) =>
                  state.onChange(
                    event.target.checked
                      ? [...state.value, option.value]
                      : state.value.filter((v) => v !== option.value),
                  ),
              })}
        />
      ))}
    </Frame>
  );
}

/**
 * A question answered by wrapping chips (many short options: temperaments, colours): a fieldset with
 * the question as its legend. The chips are the children (`Chip kind="option"`, checkbox or radio);
 * `extra` is what an "other" chip opens, kept inside the group so the group still holds everything it
 * asks. `disabled` disables every chip at once.
 */
export function ChipGroup({
  name,
  legend,
  hint,
  error,
  disabled,
  extra,
  className,
  children,
}: Pick<GroupBase, "name" | "legend" | "hint" | "error" | "disabled" | "className"> & {
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Frame {...{ name, legend, hint, error, disabled, className }}>
      <div className="flex flex-wrap gap-2">{children}</div>
      {extra}
    </Frame>
  );
}
