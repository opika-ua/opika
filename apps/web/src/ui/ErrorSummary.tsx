import type { Ref } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";

/** One problem in the summary: `message` is the same sentence the field shows under itself. */
export type ErrorSummaryItem = {
  /** Unique within the list. */
  key: string;
  message: string;
  /** A CSS selector for the field the item takes you to; a radio group names its first radio. */
  target: string;
};

const focusTarget = (selector: string) => {
  const target = document.querySelector<HTMLElement>(selector);
  if (target === null) return;
  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
};

/**
 * What a refused save says, once, at the top of the form: every problem as a button that takes you
 * to its field. The panel is a live alert and a focus target (`ref`): the form focuses it when a
 * person asks to save and is refused (never for an autosave, which must not pull focus from where
 * they are typing), so a keyboard or screen-reader user lands on the list instead of hunting for
 * the field. The sentences repeat the ones under the fields; this is the way in, not a second
 * wording. The kit holds no copy: the messages arrive as props.
 */
export function ErrorSummary({
  items,
  ref,
}: {
  items: readonly ErrorSummaryItem[];
  ref: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} role="alert" tabIndex={-1} className="rounded-panel focus-ring">
      <Panel tone="outline" padding="lg">
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key}>
              <Button
                variant="ghost"
                className="w-full justify-start text-left"
                onClick={() => focusTarget(item.target)}
              >
                {item.message}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
