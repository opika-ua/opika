import Link from "next/link";
import { cx } from "./cx";

/**
 * A short top-level nav (the kabinet's «Головна · Тварини · Притулок»). Text tabs, each 48px, the
 * current one marked `aria-current="page"` and filled from that attribute's state. `layout`:
 * `bar` stays a fixed bottom bar at every width; `bar-then-rail` is a bottom bar below `desktop` and a
 * side column from `desktop` up. The page needs bottom padding equal to the bar's height on a phone.
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
    "desktop:static desktop:inset-auto desktop:z-auto desktop:w-55 desktop:flex-none desktop:flex-col desktop:bg-transparent desktop:p-0",
} as const;

export function BottomNav({ label, items, current, layout = "bar" }: BottomNavProps) {
  return (
    <nav
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
              "flex min-h-target flex-1 items-center justify-center rounded-field px-4 text-label focus-ring",
              layout === "bar-then-rail" && "desktop:flex-none desktop:justify-start",
              isCurrent ? "bg-ink text-on-ink" : "text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
