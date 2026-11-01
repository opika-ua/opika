"use client";

import { fillTemplate, ukPublic as uk } from "@opika/i18n/public";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../../ui/Icon";
import { readLikesStore, subscribeToLikesChanges } from "./likes-store";

/** The badge reads «99+» above this; the accessible name keeps the real number. */
const BADGE_CAP = 99;

type SavedButtonProps = {
  /** `button`: the header's 44px circular bookmark. `row`: the «Збережені» row in the mobile menu. */
  layout: "button" | "row";
  /** On `/zberezheni` itself: the button is filled and carries `aria-current`. */
  current?: boolean;
  testId: string;
  /** Row only: the row's classes, shared with the menu's other links. */
  rowClassName?: string;
};

/**
 * The header's saved entry, for everyone (visitor and shelter), shown only while something is saved.
 *
 * It is in the server HTML for every request and shown by CSS from `<html data-has-saved>`, which
 * the inline pre-paint script sets from the likes store before first paint (`saved-prepaint.ts`),
 * so a visitor with saves never sees the header jump. This island then fills in the number and
 * keeps that attribute in step with the store. `localStorage` is read in an effect, never at
 * render, for the same hydration reason `SaveButton` documents.
 */
export function SavedButton({ layout, current = false, testId, rowClassName }: SavedButtonProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const next = readLikesStore().items.length;
      setCount(next);
      const root = document.documentElement;
      if (next > 0) root.setAttribute("data-has-saved", "");
      else root.removeAttribute("data-has-saved");
    };
    read();
    return subscribeToLikesChanges(read);
  }, []);

  const name =
    count === null ? uk.nav.saved : fillTemplate(uk.nav.savedWithCount, { count: String(count) });
  const badgeText = count === null ? "" : count > BADGE_CAP ? `${BADGE_CAP}+` : String(count);
  const badge = (
    <span
      aria-hidden="true"
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1 text-caption font-bold text-on-ink"
    >
      {badgeText}
    </span>
  );

  if (layout === "row") {
    return (
      <Link
        href="/zberezheni"
        aria-label={name}
        aria-current={current ? "page" : undefined}
        hidden={count === 0}
        data-testid={testId}
        className={`saved-slot items-center justify-between ${rowClassName ?? ""}`}
      >
        <span aria-hidden="true">{uk.nav.saved}</span>
        {badge}
      </Link>
    );
  }

  return (
    <Link
      href="/zberezheni"
      aria-label={name}
      aria-current={current ? "page" : undefined}
      hidden={count === 0}
      data-testid={testId}
      className="saved-slot size-target shrink-0 items-center justify-center rounded-pill focus-ring"
    >
      <span
        className={`relative inline-flex size-11 items-center justify-center rounded-pill border transition-colors duration-(--duration-quick) ${
          current ? "border-ink bg-ink text-on-ink" : "border-line text-ink hover:border-ink"
        }`}
      >
        <Icon name="bookmark" className={current ? "fill-current" : ""} />
        <span className="absolute -top-1 -right-1">{badge}</span>
      </span>
    </Link>
  );
}
