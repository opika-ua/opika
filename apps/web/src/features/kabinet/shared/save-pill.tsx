"use client";

import { uk } from "@opika/i18n";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, buttonClass } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { StickyActionBar } from "../../../ui/StickyActionBar";
import {
  SAVED_PILL_MS,
  type SaveBarState,
  type SaveTone,
  saveBarTextOf,
  saveToneOf,
} from "./save-state";

const PHONE = "(max-width: 599px)";
const subscribePhone = (notify: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isPhone = () => window.matchMedia(PHONE).matches;

const DOT: Record<SaveTone, string> = {
  ok: "bg-status-published-ink",
  pending: "bg-accent",
  error: "bg-danger",
  busy: "",
};

/** The state's mark: a dot, or a spinner while saving (it stops under reduced motion). */
function SaveDot({ tone }: { tone: SaveTone }) {
  return tone === "busy" ? (
    <span
      aria-hidden="true"
      className="size-5 shrink-0 animate-spin-fast rounded-pill border-2 border-line border-t-ink motion-reduce:animate-none"
    />
  ) : (
    <span aria-hidden="true" className={cx("size-2.5 shrink-0 rounded-pill", DOT[tone])} />
  );
}

/**
 * The kabinet's one save control. From `tablet` a floating pill (56px) right-aligned to its form
 * column, 16px above the bottom (`desktop`) or above the bottom nav; on a phone a full-width bar
 * with the status on top and two equal 48px buttons below (one row when it only confirms a save).
 * It exists only while there is something to act on (`state` not null): the quiet states live in
 * the status line under the tabs, which is the live region, so the pill never takes focus or
 * speaks twice. Esc does nothing here, so nothing is discarded by accident.
 */
export function SavePill({
  state,
  onSave,
  onCancel,
  onShow,
  onRetry,
  onSavedElapsed,
}: {
  state: SaveBarState | null;
  onSave: () => void;
  onCancel: () => void;
  /** «Показати»: the page switches to the tab and focuses the first field that needs fixing. */
  onShow: () => void;
  onRetry: () => void;
  /** The 4 s of «Збережено о …» are over; the page stops passing `saved`. */
  onSavedElapsed: () => void;
}) {
  const t = uk.kabinet.profileEdit;
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const box = useRef<HTMLDivElement | null>(null);
  const [held, setHeld] = useState(false);
  const elapsed = useRef(onSavedElapsed);
  elapsed.current = onSavedElapsed;
  const savedAt = state?.kind === "saved" ? state.at.getTime() : null;

  // Hover or focus inside holds the confirmation; letting go gives it its full time again.
  useEffect(() => {
    if (savedAt === null || held) return;
    const timer = window.setTimeout(() => elapsed.current(), SAVED_PILL_MS);
    return () => window.clearTimeout(timer);
  }, [savedAt, held]);

  // Plain listeners: the box is a container, not a control, so it takes no React handlers.
  const showing = state !== null;
  useEffect(() => {
    const node = box.current;
    if (node === null) return;
    const hold = () => setHeld(true);
    const release = () => setHeld(false);
    node.addEventListener("mouseenter", hold);
    node.addEventListener("mouseleave", release);
    node.addEventListener("focusin", hold);
    node.addEventListener("focusout", release);
    return () => {
      node.removeEventListener("mouseenter", hold);
      node.removeEventListener("mouseleave", release);
      node.removeEventListener("focusin", hold);
      node.removeEventListener("focusout", release);
    };
  }, [showing]);

  if (state === null) return null;

  const saving = state.kind === "saving";
  const secondary = phone ? "secondary" : "ghost";
  const grow = phone ? "w-full" : undefined;
  const cancel = (
    <Button
      variant={secondary}
      className={grow}
      aria-disabled={saving || undefined}
      onClick={() => {
        if (!saving) onCancel();
      }}
    >
      {t.saveBar.cancel}
    </Button>
  );
  const primary = (label: string, action: () => void, disabled = false) => (
    <Button
      className={grow}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) action();
      }}
    >
      {label}
    </Button>
  );

  let buttons: ReactNode = null;
  switch (state.kind) {
    case "unsaved":
    case "saving":
      buttons = (
        <>
          {cancel}
          {primary(t.actions.save, onSave, saving)}
        </>
      );
      break;
    case "invalid":
      buttons = (
        <>
          <Button variant={secondary} className={grow} onClick={onShow}>
            {t.saveBar.show}
          </Button>
          {primary(t.actions.save, onSave)}
        </>
      );
      break;
    case "failed":
      buttons = (
        <>
          {cancel}
          {primary(t.state.retry, onRetry)}
        </>
      );
      break;
    case "blocked":
      buttons =
        state.action === undefined ? null : primary(state.action.label, state.action.onPress);
      break;
    case "saved":
      buttons =
        state.viewHref === undefined ? null : (
          <a
            href={state.viewHref}
            target="_blank"
            rel="noopener"
            className={cx(buttonClass("ghost"), "underline")}
          >
            {uk.kabinet.profileTabs.view}
            <span className="sr-only"> {uk.kabinet.shell.newTab}</span>
          </a>
        );
  }

  const blocked = state.kind === "blocked";
  // A phone shows the confirmation on one row; everything else stacks the status over the buttons.
  const oneRow = state.kind === "saved";
  return (
    <StickyActionBar tone="float">
      <div
        ref={box}
        data-save-pill={state.kind}
        className={cx(
          "flex border-line bg-surface text-ink",
          // Phone: a full-width bar, 12px above and 14px below its content.
          "-mx-4 border-t px-4 pt-3 pb-3.5",
          oneRow ? "flex-row items-center justify-between gap-2" : "flex-col gap-2",
          // From tablet: a pill that hugs its content at the column's right edge.
          "tablet:mx-0 tablet:ml-auto tablet:w-fit tablet:max-w-full tablet:flex-row tablet:items-center tablet:gap-3 tablet:rounded-pill tablet:border tablet:py-1 tablet:pr-1 tablet:pl-5 tablet:shadow-float",
          blocked ? "tablet:min-h-14" : "tablet:h-14",
        )}
      >
        <p className="flex min-w-0 items-center gap-2 text-label">
          <SaveDot tone={saveToneOf(state)} />
          <span className="min-w-0">{saveBarTextOf(state)}</span>
        </p>
        {buttons === null ? null : (
          <div
            className={cx(
              "flex items-center gap-2",
              // Two buttons share a phone bar in equal columns (a flexed pair differs by the outline's border).
              state.kind !== "blocked" && !oneRow && "max-tablet:grid max-tablet:grid-cols-2",
            )}
          >
            {buttons}
          </div>
        )}
      </div>
    </StickyActionBar>
  );
}

/**
 * The quiet status line under the tabs: always in the DOM, so a change is read out politely without
 * moving focus. It carries the state when there is no pill (clean, a draft's autosave) and repeats
 * it while the pill shows.
 */
export function SaveStatusLine({
  message,
  state,
}: {
  message: string | null;
  state: SaveBarState | null;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex min-h-5 items-center gap-2 text-caption text-ink-2"
    >
      {message === null ? null : (
        <>
          <SaveDot tone={saveToneOf(state)} />
          <span>{message}</span>
        </>
      )}
    </p>
  );
}
