"use client";

import type { ReactNode, Ref } from "react";

/** One field in the summary: `label` is what the item says (the field's name, in the new practice). */
export type ErrorSummaryItem = {
  /** Unique within the list. */
  key: string;
  label: string;
  /** A CSS selector for the field the item takes you to; a radio group names its first radio. */
  target: string;
  /** When the field can be out of sight (a hidden tab), the page brings it into view and focuses it itself. */
  onSelect?: () => void;
};

/** Where a refused submit sends focus: the summary only with two or more problems, else the one field. */
export type ErrorFocus =
  | { kind: "none" }
  | { kind: "field"; item: ErrorSummaryItem }
  | { kind: "summary" };

export function errorFocusOf(items: readonly ErrorSummaryItem[]): ErrorFocus {
  const [first] = items;
  if (first === undefined) return { kind: "none" };
  return items.length === 1 ? { kind: "field", item: first } : { kind: "summary" };
}

export function focusErrorField(item: ErrorSummaryItem): void {
  if (item.onSelect !== undefined) {
    item.onSelect();
    return;
  }
  const target = document.querySelector<HTMLElement>(item.target);
  if (target === null) return;
  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
}

/**
 * A refused submit, once, at the top of the form: a heading and each field as a link that focuses
 * it. A live alert and a focus target (`ref`); show it when `errorFocusOf` says `summary`.
 */
export function ErrorSummary({
  heading,
  items,
  ref,
}: {
  /** «Заповніть 3 поля:», counted by the caller. */
  heading?: ReactNode;
  items: readonly ErrorSummaryItem[];
  ref: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-panel border-2 border-danger bg-danger-bg p-5 focus-ring"
    >
      {heading === undefined ? null : <p className="text-label text-danger">{heading}</p>}
      <ul className="flex list-disc flex-col pl-6 text-ink">
        {items.map((item) => (
          <li key={item.key}>
            <a
              href={item.target.startsWith("#") ? item.target : "#"}
              className="inline-flex min-h-target items-center text-body text-ink underline underline-offset-4 focus-ring"
              onClick={(event) => {
                event.preventDefault();
                focusErrorField(item);
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
