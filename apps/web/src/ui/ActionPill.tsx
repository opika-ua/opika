import { Fragment, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * A few icon-only actions in one small floating pill over a photo (the photo manager's crop and
 * remove), split by a thin rule. To the eye it is 40px tall with 44px-wide buttons; each button
 * is 48px tall and centred on the pill, so the touch target meets the kit's floor unchanged.
 */
type ActionBase = {
  /** Stable per action: the React key. */
  id: string;
  icon: IconName;
  /** The accessible name; the button shows only the icon. */
  label: string;
  /** The button's DOM id, for giving focus back to it. */
  buttonId?: string;
  /** Pointer over it or focus on it: warm up what it opens (a lazy dialog's chunk). */
  onIntent?: () => void;
};

/** `blocked` stays focusable (`aria-disabled`) and is described by the sentence that says why. */
export type ActionPillAction =
  | (ActionBase & { kind: "ready"; onClick: () => void })
  | (ActionBase & { kind: "blocked"; reasonId: string });

export type ActionPillProps = {
  actions: readonly ActionPillAction[];
  /** One more description for every button: the id of a hint, such as a keyboard shortcut's. */
  describedBy?: string;
  /** A key pressed on any button, with that button's action: a shortcut for the whole pill. */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>, action: ActionPillAction) => void;
  /** Layout only: where the pill sits (`absolute right-2 bottom-2`). */
  className?: string;
};

export function ActionPill({ actions, describedBy, onKeyDown, className }: ActionPillProps) {
  if (actions.length === 0) return null;
  return (
    <div
      className={cx(
        "flex h-10 items-center rounded-pill bg-surface/94 text-ink shadow-float",
        className,
      )}
    >
      {actions.map((action, index) => {
        const described = [action.kind === "blocked" ? action.reasonId : undefined, describedBy]
          .filter((id) => id !== undefined)
          .join(" ");
        return (
          <Fragment key={action.id}>
            {index === 0 ? null : <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />}
            <button
              type="button"
              id={action.buttonId}
              aria-label={action.label}
              aria-disabled={action.kind === "blocked" || undefined}
              aria-describedby={described === "" ? undefined : described}
              onClick={action.kind === "ready" ? action.onClick : undefined}
              onKeyDown={onKeyDown === undefined ? undefined : (event) => onKeyDown(event, action)}
              onPointerEnter={action.onIntent}
              onFocus={action.onIntent}
              className="inline-flex min-h-target w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill focus-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            >
              <Icon name={action.icon} size="md" />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
