import { ukPublic as uk } from "@opika/i18n/public";
import Link from "next/link";
import { Icon } from "../../ui/Icon";
import type { ActiveFilterChip } from "./active-filters";

/**
 * The phone's row of filters in force: one removable chip each, then «Скинути». Plain links, so
 * the row works without JS (the page wraps it in `ReplaceNav`, which only makes them replace the
 * history entry). Scrolls sideways instead of wrapping, so it stays one line tall.
 */
export function ActiveFilterChips({
  chips,
  resetHref,
}: {
  chips: readonly ActiveFilterChip[];
  resetHref: string;
}) {
  if (chips.length === 0) return null;
  return (
    <ul
      data-testid="active-filter-chips"
      aria-label={uk.filters.title}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 tablet:-mx-6 tablet:px-6"
    >
      {chips.map((chip) => (
        <li key={chip.key} className="shrink-0">
          <Link
            href={chip.href}
            prefetch={false}
            aria-label={chip.removeLabel}
            className="inline-flex min-h-target items-center gap-2 whitespace-nowrap rounded-pill border-2 border-line bg-surface px-4 text-label text-ink focus-ring"
          >
            {chip.name}
            <Icon name="close" size="sm" />
          </Link>
        </li>
      ))}
      <li className="shrink-0">
        <Link
          href={resetHref}
          prefetch={false}
          className="inline-flex min-h-target items-center whitespace-nowrap px-3 text-label text-ink underline focus-ring"
        >
          {uk.filters.reset}
        </Link>
      </li>
    </ul>
  );
}
