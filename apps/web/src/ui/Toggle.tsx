import Link from "next/link";
import { cx } from "./cx";

/**
 * A two-option switch made of two real links (the gallery's sort: «Нові ⬤ Зачекались»). Each option
 * is a link, so choosing is a navigation and works without JS; the middle track is decorative (hidden
 * from assistive tech and the tab order) and leads to the other option. `ariaLabel` on an option should
 * start with its visible label (WCAG 2.5.3) and may add context after it.
 */
export type ToggleOption = { label: string; href: string; ariaLabel?: string };

export type ToggleProps = {
  /** Names the nav landmark. */
  label: string;
  options: readonly [ToggleOption, ToggleOption];
  /** Which option is current. */
  current: 0 | 1;
  className?: string;
};

function OptionLink({ option, isCurrent }: { option: ToggleOption; isCurrent: boolean }) {
  return (
    <Link
      prefetch={false}
      href={option.href}
      aria-label={option.ariaLabel}
      aria-current={isCurrent ? "true" : undefined}
      className={cx(
        "flex min-h-target items-center rounded-pill px-2 text-body-l font-semibold focus-ring",
        isCurrent ? "text-ink" : "text-ink-2",
      )}
    >
      {option.label}
    </Link>
  );
}

export function Toggle({ label, options, current, className }: ToggleProps) {
  const other = options[current === 0 ? 1 : 0];
  return (
    <nav aria-label={label} className={cx("flex min-h-13 shrink-0 items-center gap-3", className)}>
      <OptionLink option={options[0]} isCurrent={current === 0} />
      <Link
        prefetch={false}
        href={other.href}
        tabIndex={-1}
        aria-hidden="true"
        className="relative inline-flex h-6.5 w-11.5 shrink-0 items-center rounded-pill bg-ink p-0.75"
      >
        <span
          className={cx(
            "block size-5 rounded-pill bg-surface transition-transform duration-(--duration-quick)",
            current === 1 ? "translate-x-5" : "translate-x-0",
          )}
        />
      </Link>
      <OptionLink option={options[1]} isCurrent={current === 1} />
    </nav>
  );
}
