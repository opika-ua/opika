import { type ReactNode, useEffect, useRef } from "react";
import { Button, buttonClass } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Heading } from "../../ui/Heading";
import { Panel } from "../../ui/Panel";
import { Text } from "../../ui/Text";

/**
 * The full-page error card both `/tvaryny` error boundaries render (the list and the deck), so
 * the two routes cannot drift apart. The boundaries themselves stay thin client files because
 * Next requires an `error.tsx` to be one. The escape link is a real `<a href>`, not `next/link`:
 * a `Link` click inside an active boundary soft-navigates within the segment that just errored
 * and never leaves it.
 */
export function LoadErrorScreen({
  eyebrow,
  title,
  body,
  retryLabel,
  onRetry,
  escapeLabel,
  testIdPrefix,
  escapeTestId,
}: {
  eyebrow: string;
  title: string;
  body: string;
  retryLabel: string;
  onRetry: () => void;
  escapeLabel: string;
  testIdPrefix: string;
  escapeTestId: string;
}): ReactNode {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus moves to the heading (docs/design/README.md, E1/E2); tabIndex -1 keeps it out of Tab order.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <>
      {/* A client component cannot export `metadata`; React hoists this tag into <head>. */}
      <meta name="robots" content="noindex, nofollow" />
      <div className="flex min-h-dvh items-center justify-center bg-page p-4">
        <Panel padding="lg" className="animate-fade-in w-full max-w-140">
          <div
            role="alert"
            aria-live="assertive"
            data-testid={testIdPrefix}
            className="flex flex-col items-start gap-4"
          >
            <Text look="hint" className="uppercase tracking-wider">
              {eyebrow}
            </Text>
            <Heading level={1} look="display-l" ref={headingRef} tabIndex={-1}>
              {title}
            </Heading>
            <Text look="lead" className="text-ink-2">
              {body}
            </Text>
            <div className="flex flex-wrap items-center gap-4">
              <Button type="button" data-testid={`${testIdPrefix}-retry`} onClick={onRetry}>
                {retryLabel}
              </Button>
              <a
                href="/tvaryny"
                data-testid={escapeTestId}
                className={cx(buttonClass("ghost"), "underline")}
              >
                {escapeLabel}
              </a>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
