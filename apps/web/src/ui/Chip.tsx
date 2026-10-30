import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/**
 * One chip, five jobs (the inventory counted about eight hand-built recipes):
 * - `option`: a checkbox or radio you choose from (filter sheet). A real input inside a label, so it
 *   submits with a plain GET form and works without JS.
 * - `toggle`: a button that acts in place, state in `aria-pressed` (also a Popover's trigger).
 * - `link`: navigates; the current one is marked with `aria-current`.
 * - `info`: a fact, not interactive (age, size, medical).
 * - `status`: a short state with a tone (reserved, adopted).
 * - `choice`: an option pill with an optional count (the filter selectors and the filter sheet),
 *   as a toggle button or a real checkbox/radio.
 * Interactive chips are 48px tall; info and status are not controls. A choice pill is 44px to the
 * eye, with its hit area stretched to 48px by a pseudo-element.
 */
const SHAPE = "inline-flex items-center rounded-pill px-5 text-label";
const CONTROL = `${SHAPE} min-h-target cursor-pointer border-2`;
// Whole sets, never layered: two colour utilities on one element is decided by stylesheet order.
const OFF = "border-line bg-page text-ink";
const ON = "border-ink bg-ink text-on-ink";

const INFO = {
  neutral: "bg-line text-ink",
  outline: "border-2 border-line bg-transparent text-ink",
} as const;
const STATUS = {
  ink: "bg-ink text-on-ink",
  accent: "bg-accent text-on-ink",
  success: "bg-success text-on-ink",
  warning: "bg-warning text-on-ink",
  danger: "bg-danger text-on-ink",
  published: "bg-status-published text-status-published-ink",
  reserved: "bg-status-reserved text-status-reserved-ink",
  adopted: "bg-status-adopted text-status-adopted-ink",
  withdrawn: "bg-status-withdrawn text-status-withdrawn-ink",
} as const;

export function chipClass(selected: boolean): string {
  return cx(CONTROL, selected ? ON : OFF);
}

// 44px drawn, 48px to the pointer: `before:` overhangs 2px above and below (the
// rows' 12px gap leaves room), and a click on it is a click on the chip. Behind
// the text (`isolate` + `-z-10`), so the label's own text stays on top.
const CHOICE =
  "relative isolate inline-flex h-11 cursor-pointer items-center gap-2 rounded-pill border px-5 text-label before:absolute before:inset-x-0 before:-inset-y-0.5 before:-z-10";
const CHOICE_OFF = "border-line bg-surface text-ink";
const CHOICE_ON = "border-ink bg-ink text-on-ink";
const CHOICE_DISABLED = "cursor-not-allowed border-line bg-surface text-ink-2";

/** A choice pill's look for something that isn't a button or an input (a link beside the pills). */
export function choiceClass(state: "off" | "on"): string {
  return cx(CHOICE, state === "on" ? CHOICE_ON : CHOICE_OFF);
}

type OptionChip = {
  kind: "option";
  type: "checkbox" | "radio";
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name" | "value" | "children">;

type ToggleChip = {
  kind: "toggle";
  pressed: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type LinkChip = {
  kind: "link";
  href: string;
  current?: boolean;
  prefetch?: boolean;
  /** When the visible text is shorter than the link's purpose («Хлопчик» vs «Показати схожих»). */
  "aria-label"?: string;
  children: ReactNode;
};

/**
 * Disabled means "nothing to choose here": a button stays focusable (`aria-disabled`) so a
 * keyboard user still hears it; an input is natively `disabled` so the no-JS form can't submit it.
 */
type ChoiceChip = {
  kind: "choice";
  /** After the label, in ink-2 (on-ink when selected). */
  count?: number;
  /** The full accessible name when the visible text abbreviates it («Київ, 34 тварини»). */
  accessibleName?: string;
  disabled?: boolean;
  children: ReactNode;
} & (
  | { control: "button"; pressed: boolean; onPress: () => void }
  | {
      control: "checkbox" | "radio";
      name: string;
      value: string;
      defaultChecked?: boolean;
    }
);

type InfoChip = { kind: "info"; tone?: keyof typeof INFO; children: ReactNode };
type StatusChip = { kind: "status"; tone: keyof typeof STATUS; children: ReactNode };

export type ChipProps = (
  | OptionChip
  | ToggleChip
  | LinkChip
  | ChoiceChip
  | InfoChip
  | StatusChip
) & {
  /** Layout only. */
  className?: string;
};

export function Chip(props: ChipProps) {
  switch (props.kind) {
    case "option": {
      const { kind: _k, type, children, className, ...input } = props;
      return (
        <label
          className={cx(
            CONTROL,
            OFF,
            "has-checked:border-ink has-checked:bg-ink has-checked:text-on-ink focus-ring-within",
            className,
          )}
        >
          <input type={type} className="sr-only" {...input} />
          {children}
        </label>
      );
    }
    case "toggle": {
      const { kind: _k, pressed, children, className, type = "button", ...button } = props;
      return (
        <button
          type={type}
          aria-pressed={pressed}
          className={cx(chipClass(pressed), "focus-ring", className)}
          {...button}
        >
          {children}
        </button>
      );
    }
    case "link":
      return (
        <Link
          href={props.href}
          {...(props.prefetch === undefined ? {} : { prefetch: props.prefetch })}
          aria-current={props.current ? "page" : undefined}
          aria-label={props["aria-label"]}
          className={cx(chipClass(props.current === true), "focus-ring", props.className)}
        >
          {props.children}
        </Link>
      );
    case "choice":
      return <ChoiceChipView {...props} />;
    case "info":
      return (
        <span className={cx(SHAPE, "py-1", INFO[props.tone ?? "neutral"], props.className)}>
          {props.children}
        </span>
      );
    case "status":
      return (
        <span className={cx(SHAPE, "py-1", STATUS[props.tone], props.className)}>
          {props.children}
        </span>
      );
  }
}

function ChoiceChipView(props: ChoiceChip & { className?: string }) {
  const count =
    props.count === undefined ? null : (
      <span
        className={
          props.control === "button"
            ? props.pressed
              ? "text-on-ink"
              : "text-ink-2"
            : "text-ink-2 group-has-checked:text-on-ink"
        }
      >
        {props.count}
      </span>
    );

  if (props.control === "button") {
    const { pressed, disabled = false } = props;
    return (
      <button
        type="button"
        aria-pressed={pressed}
        aria-disabled={disabled ? true : undefined}
        aria-label={props.accessibleName}
        onClick={() => {
          if (!disabled) props.onPress();
        }}
        className={cx(
          CHOICE,
          pressed ? CHOICE_ON : disabled ? CHOICE_DISABLED : CHOICE_OFF,
          "focus-ring",
          props.className,
        )}
      >
        <span>{props.children}</span>
        {count}
      </button>
    );
  }

  return (
    <label
      className={cx(
        CHOICE,
        "group",
        props.disabled ? CHOICE_DISABLED : CHOICE_OFF,
        "has-checked:border-ink has-checked:bg-ink has-checked:text-on-ink focus-ring-within",
        props.className,
      )}
    >
      <input
        type={props.control}
        name={props.name}
        value={props.value}
        defaultChecked={props.defaultChecked}
        disabled={props.disabled}
        aria-label={props.accessibleName}
        className="sr-only"
      />
      <span>{props.children}</span>
      {count}
    </label>
  );
}
