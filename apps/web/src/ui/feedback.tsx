import type { ReactNode } from "react";
import { cx } from "./cx";
import { Heading } from "./Heading";
import { Panel } from "./Panel";
import { Text } from "./Text";

/**
 * Empty, error and inline-status states. Copy always arrives as props (the kit holds no strings).
 * Errors are never red alone: they carry words, and `role="alert"` so they are announced.
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  /** Usually a LinkButton or Button. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Panel tone="surface" padding="lg" className={cx("flex flex-col items-start gap-3", className)}>
      <Heading level={2} look="title">
        {title}
      </Heading>
      {body === undefined ? null : <Text look="body">{body}</Text>}
      {action}
    </Panel>
  );
}

export function ErrorState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Panel tone="outline" padding="lg" className={cx("flex flex-col items-start gap-3", className)}>
      <div role="alert" className="flex flex-col gap-2">
        <Heading level={2} look="title">
          {title}
        </Heading>
        {body === undefined ? null : <Text look="body">{body}</Text>}
      </div>
      {action}
    </Panel>
  );
}

const STATUS = {
  info: { box: "border-line bg-surface", role: "status" },
  success: { box: "border-success bg-surface", role: "status" },
  warning: { box: "border-warning bg-surface", role: "status" },
  error: { box: "border-danger bg-surface", role: "alert" },
} as const;

/** A short message next to the thing it concerns (a saved form, a failed upload). */
export function InlineStatus({
  tone,
  children,
  className,
}: {
  tone: keyof typeof STATUS;
  children: ReactNode;
  className?: string;
}) {
  const { box, role } = STATUS[tone];
  return (
    <div
      role={role}
      className={cx("rounded-field border-2 px-4 py-3 text-label text-ink", box, className)}
    >
      {children}
    </div>
  );
}
