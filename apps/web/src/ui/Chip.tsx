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
 * Interactive chips are 48px tall; info and status are not controls.
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
} as const;

export function chipClass(selected: boolean): string {
  return cx(CONTROL, selected ? ON : OFF);
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
  children: ReactNode;
};

type InfoChip = { kind: "info"; tone?: keyof typeof INFO; children: ReactNode };
type StatusChip = { kind: "status"; tone: keyof typeof STATUS; children: ReactNode };

export type ChipProps = (OptionChip | ToggleChip | LinkChip | InfoChip | StatusChip) & {
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
          className={cx(chipClass(props.current === true), "focus-ring", props.className)}
        >
          {props.children}
        </Link>
      );
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
