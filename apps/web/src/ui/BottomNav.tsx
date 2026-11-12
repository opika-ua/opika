import Link from "next/link";
import { cx } from "./cx";
import { BOTTOM_BAR } from "./sticky-bar";

/**
 * A short top-level nav (the kabinet's «Тварини · Притулок»). Text only. `layout`: `bar` stays a
 * fixed bottom bar at every width; `bar-then-rail` is a bottom bar below `desktop` (safe-area aware,
 * every tab 48px) and a side column from `desktop` up. The current item is marked
 * `aria-current="page"`: on the bar an orange rule over a tinted tab, in the rail a tinted row with an
 * orange marker on its left edge. The page needs bottom padding equal to the bar on a phone.
 */
export type BottomNavItem = { key: string; href: string; label: string };

export type BottomNavProps = {
  label: string;
  items: readonly BottomNavItem[];
  /** The `key` of the current page. */
  current: string;
  layout?: "bar" | "bar-then-rail";
};

const LAYOUT = {
  bar: "",
  "bar-then-rail":
    "desktop:static desktop:border-t-0 desktop:inset-auto desktop:z-auto desktop:w-55 desktop:flex-none desktop:flex-col desktop:bg-transparent desktop:p-0",
} as const;

// The marker is drawn only on the current item: a rule over the tab, or a bar on the row's left edge.
const MARKER = {
  bar: "before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-pill before:bg-accent",
  "bar-then-rail":
    "before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-pill before:bg-accent desktop:before:inset-x-auto desktop:before:inset-y-2 desktop:before:left-0 desktop:before:h-auto desktop:before:w-1",
} as const;

export function BottomNav({ label, items, current, layout = "bar" }: BottomNavProps) {
  return (
    <nav
      {...BOTTOM_BAR}
      aria-label={label}
      className={cx(
        "fixed inset-x-0 bottom-0 z-(--z-header) flex gap-1 border-t-2 border-line bg-surface px-2 pt-2 pb-inset",
        LAYOUT[layout],
      )}
    >
      {items.map((item) => {
        const isCurrent = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            aria-current={isCurrent ? "page" : undefined}
            className={cx(
              "relative flex min-h-target flex-1 items-center justify-center rounded-field px-4 text-label text-ink focus-ring",
              layout === "bar-then-rail" &&
                "desktop:flex-none desktop:justify-start desktop:hover:bg-line",
              isCurrent && cx("bg-line", MARKER[layout]),
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
