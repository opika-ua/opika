import { useCallback, useEffect, useRef, useState } from "react";

/** The tile being dragged: where it came from, the slot it would land in, and the ghost's box. */
export type PhotoDrag = {
  from: number;
  over: number;
  x: number;
  y: number;
  /** Pointer offset inside the tile when it was picked up, so the ghost does not jump. */
  dx: number;
  dy: number;
  width: number;
  height: number;
};

export type PhotoDragEvents = {
  onPickUp: (from: number) => void;
  onMove: (over: number) => void;
  /** Called once on release over a different slot; the caller makes the one reorder call. */
  onDrop: (from: number, to: number) => void;
  onCancel: () => void;
};

// A mouse press that moves less than this is a click, not a drag.
const MOUSE_START_DISTANCE = 5;
// A finger that moves further than this before the hold completes is scrolling the page.
const TOUCH_SLOP = 8;
const HOLD_MS = 350;
const EDGE_SCROLL = 80;
const MAX_SCROLL_STEP = 16;

const slotAt = (x: number, y: number, count: number): number | null => {
  const raw = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-photo-slot]")
    ?.dataset.photoSlot;
  const slot = raw === undefined ? null : Number(raw);
  return slot !== null && slot >= 0 && slot < count ? slot : null;
};

/** Pixels per frame, growing as the pointer nears the viewport's top or bottom edge. */
const scrollStep = (y: number): number => {
  if (y < EDGE_SCROLL) return -Math.ceil(((EDGE_SCROLL - y) / EDGE_SCROLL) * MAX_SCROLL_STEP);
  const fromBottom = window.innerHeight - y;
  if (fromBottom < EDGE_SCROLL)
    return Math.ceil(((EDGE_SCROLL - fromBottom) / EDGE_SCROLL) * MAX_SCROLL_STEP);
  return 0;
};

/**
 * Hand-rolled drag for the photo grid on Pointer Events (no library, as the swipe deck). The whole
 * tile is the target: a mouse drags after a few pixels of movement; a finger lifts the photo after
 * a long press and, if it moves first, is left to scroll the page (the tile keeps the default
 * `touch-action`). Once lifted, a non-passive `touchmove` stops the page from scrolling under the
 * finger. Listeners live on `window` while a press is open, not on the tile: React moves the tile
 * in the DOM as the others reflow, which would drop a pointer capture. Esc, a second finger or
 * `pointercancel` cancels; nothing is written until release.
 */
export function usePhotoDrag(count: number, events: PhotoDragEvents) {
  const [drag, setDrag] = useState<PhotoDrag | null>(null);
  const current = useRef<PhotoDrag | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const countRef = useRef(count);
  countRef.current = count;

  const end = useCallback((outcome: "drop" | "cancel") => {
    const last = current.current;
    stop.current?.();
    stop.current = null;
    current.current = null;
    setDrag(null);
    if (last === null) return;
    if (outcome === "cancel") eventsRef.current.onCancel();
    else if (last.over !== last.from) eventsRef.current.onDrop(last.from, last.over);
    else eventsRef.current.onCancel();
  }, []);

  const start = useCallback(
    (
      from: number,
      event: {
        clientX: number;
        clientY: number;
        pointerId: number;
        pointerType: string;
        currentTarget: Element;
      },
    ) => {
      // A second press while one is open (a second finger) puts the first back and starts nothing.
      if (stop.current !== null) {
        end("cancel");
        return;
      }
      const rect = event.currentTarget.closest("[data-photo-slot]")?.getBoundingClientRect();
      if (rect === undefined) return;
      const origin = { x: event.clientX, y: event.clientY };
      const latest = { ...origin };
      const touch = event.pointerType !== "mouse";
      const pointerId = event.pointerId;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let frame = 0;

      const lift = (x: number, y: number) => {
        const next: PhotoDrag = {
          from,
          over: from,
          x,
          y,
          dx: origin.x - rect.left,
          dy: origin.y - rect.top,
          width: rect.width,
          height: rect.height,
        };
        current.current = next;
        setDrag(next);
        if (touch && typeof navigator.vibrate === "function") navigator.vibrate(10);
        eventsRef.current.onPickUp(from);
        if (touch) frame = requestAnimationFrame(tick);
      };

      const follow = (x: number, y: number) => {
        const active = current.current;
        if (active === null) return;
        const over = slotAt(x, y, countRef.current) ?? active.over;
        current.current = { ...active, x, y, over };
        setDrag(current.current);
        if (over !== active.over) eventsRef.current.onMove(over);
      };

      // Near the top or bottom edge the page keeps scrolling while the finger rests, and the slot
      // under it is re-read after each step.
      function tick() {
        const step = scrollStep(latest.y);
        if (step !== 0) {
          window.scrollBy(0, step);
          follow(latest.x, latest.y);
        }
        frame = requestAnimationFrame(tick);
      }

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        latest.x = move.clientX;
        latest.y = move.clientY;
        if (current.current !== null) {
          follow(move.clientX, move.clientY);
          if (!touch) {
            const step = scrollStep(move.clientY);
            if (step !== 0) window.scrollBy(0, step);
          }
          return;
        }
        const moved = Math.hypot(move.clientX - origin.x, move.clientY - origin.y);
        if (touch) {
          if (moved > TOUCH_SLOP) release();
        } else if (moved >= MOUSE_START_DISTANCE) {
          lift(move.clientX, move.clientY);
        }
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== pointerId) return;
        if (current.current === null) release();
        else end("drop");
      };
      const onCancel = (cancel: PointerEvent) => {
        if (cancel.pointerId !== pointerId) return;
        if (current.current === null) release();
        else end("cancel");
      };
      // A second finger is a pinch or a stray touch: put the photo back.
      const onOtherDown = (down: PointerEvent) => {
        if (down.pointerId === pointerId) return;
        if (current.current === null) release();
        else end("cancel");
      };
      const onKey = (key: KeyboardEvent) => {
        if (key.key !== "Escape" || current.current === null) return;
        key.preventDefault();
        end("cancel");
      };
      const onTouchMove = (move: TouchEvent) => {
        if (current.current !== null && move.cancelable) move.preventDefault();
      };
      function release() {
        stop.current?.();
        stop.current = null;
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("pointerdown", onOtherDown);
      document.addEventListener("keydown", onKey);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      // The pressed tile leaves the DOM when the others reflow, and a touch keeps firing at its
      // first target: listening on that node too keeps the page from scrolling under the finger.
      const pressed = event.currentTarget;
      pressed.addEventListener("touchmove", onTouchMove as EventListener, { passive: false });
      if (touch) timer = setTimeout(() => lift(latest.x, latest.y), HOLD_MS);
      stop.current = () => {
        if (timer !== null) clearTimeout(timer);
        cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("pointerdown", onOtherDown);
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("touchmove", onTouchMove);
        pressed.removeEventListener("touchmove", onTouchMove as EventListener);
      };
    },
    [end],
  );

  useEffect(
    () => () => {
      stop.current?.();
    },
    [],
  );

  return { drag, start };
}
