import type { ReactNode } from "react";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { cx } from "./cx";
import { Heading } from "./Heading";

/**
 * A long form split into named sections that all stay on the page (no tabs, no hiding), so the form
 * works as plain anchored content without JS. `step` adds the section's number as a badge; pair it
 * with `FormSteps` for a row of links to the sections. The number is decoration: the heading names
 * the section, and the order in the document is the order of the steps.
 */
export type FormSectionProps = {
  /** The anchor: `FormSteps` links to `#id`. The heading is `${id}-title`. */
  id: string;
  title: ReactNode;
  /** The section's 1-based place in the form; omit for an unnumbered section. */
  step?: number;
  /** Sits in the title row after the heading, outside it (an InfoTip, a counter), so the heading's name stays the title. */
  titleExtra?: ReactNode;
  /** One quiet line under the title: what this section is for. */
  description?: ReactNode;
  /** `card` (default) is a white card with inner padding; `flush` has no frame or side padding, so its content shares the left edge of whatever sits above it (tabs). */
  framing?: "card" | "flush";
  /** Layout only. */
  className?: string;
  children: ReactNode;
};

export function FormSection({
  id,
  title,
  step,
  titleExtra,
  description,
  framing = "card",
  className,
  children,
}: FormSectionProps) {
  const titleId = `${id}-title`;
  return (
    <Card
      as="section"
      id={id}
      aria-labelledby={titleId}
      tone={framing === "flush" ? "page" : "surface"}
      className={cx("scroll-mt-4", className)}
    >
      <div
        className={cx(
          "flex flex-col gap-5 tablet:gap-6",
          framing === "flush" ? "py-4 tablet:py-6" : "p-4 tablet:p-6 desktop:p-8",
        )}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            {step === undefined ? null : (
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-pill bg-ink text-label text-on-ink"
              >
                {step}
              </span>
            )}
            <Heading level={2} look="section" id={titleId} tabIndex={-1}>
              {title}
            </Heading>
            {titleExtra}
          </div>
          {description === undefined ? null : (
            <p className="text-caption text-ink-2">{description}</p>
          )}
        </div>
        {children}
      </div>
    </Card>
  );
}

export type FormStep = { id: string; label: string };

/**
 * The form's sections as a row of links, in order, each to its `FormSection`'s `id`. Plain anchors
 * (a hash change, no script), 48px chips that scroll sideways on a phone and sit in one row from
 * tablet. `labelledBy` is the id of the element that names the form (its page title): the kit
 * holds no copy of its own.
 */
export function FormSteps({
  labelledBy,
  steps,
  className,
}: {
  labelledBy: string;
  steps: readonly FormStep[];
  className?: string;
}) {
  return (
    <nav aria-labelledby={labelledBy} className={cx("min-w-0", className)}>
      <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 tablet:mx-0 tablet:flex-wrap tablet:overflow-visible tablet:px-0">
        {steps.map((step, index) => (
          <li key={step.id} className="shrink-0">
            <Chip kind="link" href={`#${step.id}`} prefetch={false}>
              <span aria-hidden="true" className="mr-2">
                {index + 1}
              </span>
              {step.label}
            </Chip>
          </li>
        ))}
      </ol>
    </nav>
  );
}
