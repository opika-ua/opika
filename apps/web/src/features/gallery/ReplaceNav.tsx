"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * Upgrades every plain `<a>` inside it to `router.replace` instead of a real
 * navigation, when JS is present. Without this, ten filter-chip clicks push
 * ten history entries, and escaping the resulting state takes ten
 * back-presses — a real annoyance the design doesn't settle, so this is the
 * decision: `replace`, not `push`, once JS can make that distinction.
 *
 * Without JS, every link underneath is untouched and behaves exactly as
 * `FilterRail`/`SortControl` already document — a plain navigation, pushing
 * a history entry per click. That's the accepted, honest degraded case, not
 * a gap: the alternative (no filtering at all without JS) is what this
 * whole phase's URL-as-form-action approach exists to avoid.
 *
 * One wrapper via event delegation rather than converting `FilterRail`/
 * `SortControl` themselves into Client Components — both stay plain,
 * server-rendered link lists; only this shell needs to be interactive.
 * Deliberately does NOT wrap the animal grid: a card's link is a real,
 * distinct navigation to a detail page, not a refinement of "the same"
 * view, and should push like any other page visit.
 */
export function ReplaceNav({ children }: { children: ReactNode }) {
  const router = useRouter();

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    if (anchor.target && anchor.target !== "_self") return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    event.preventDefault();
    router.replace(href, { scroll: false });
  };

  // `contents`: this wrapper must not become a flex/grid item in its own
  // right — FilterRail's `w-70 shrink-0` and SortControl's own sizing
  // assume they ARE the direct flex child of page.tsx's layout row. A
  // plain wrapping <div> would insert itself as that child instead,
  // silently changing how much room the rail is protected from losing.
  return (
    <div className="contents" onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
