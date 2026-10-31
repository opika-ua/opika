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

// A press that moves less than this is a click on the handle, not a drag.
const START_DISTANCE = 6;
const EDGE_SCROLL = 80;

const slotAt = (x: number, y: number, count: number): number | null => {
  const raw = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-photo-slot]")
    ?.dataset.photoSlot;
  const slot = raw === undefined ? null : Number(raw);
  return slot !== null && slot >= 0 && slot < count ? slot : null;
};

/**
 * Hand-rolled drag for the photo grid on Pointer Events (no library, as the swipe deck). Listeners
 * live on `window` while a press is open, not on the tile: React moves the tile in the DOM as the
 * others reflow, which would drop a pointer capture. `start` is called from the handle's (or, for
 * a mouse, the photo's) `pointerdown`; the handle sets `touch-action: none`, so a finger on
 * anything else still scrolls the page. Esc cancels; nothing is written until release.
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
    (from: number, event: { clientX: number; clientY: number; currentTarget: Element }) => {
      stop.current?.();
      const rect = event.currentTarget.closest("[data-photo-slot]")?.getBoundingClientRect();
      if (rect === undefined) return;
      const origin = { x: event.clientX, y: event.clientY };

      const onMove = (move: PointerEvent) => {
        const active = current.current;
        if (active === null) {
          if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < START_DISTANCE) return;
          const next: PhotoDrag = {
            from,
            over: from,
            x: move.clientX,
            y: move.clientY,
            dx: origin.x - rect.left,
            dy: origin.y - rect.top,
            width: rect.width,
            height: rect.height,
          };
          current.current = next;
          setDrag(next);
          eventsRef.current.onPickUp(from);
          return;
        }
        const over = slotAt(move.clientX, move.clientY, countRef.current) ?? active.over;
        const next = { ...active, x: move.clientX, y: move.clientY, over };
        current.current = next;
        setDrag(next);
        if (over !== active.over) eventsRef.current.onMove(over);
        if (move.clientY < EDGE_SCROLL) window.scrollBy(0, -12);
        else if (move.clientY > window.innerHeight - EDGE_SCROLL) window.scrollBy(0, 12);
      };
      const onUp = () => (current.current === null ? release() : end("drop"));
      const onCancel = () => (current.current === null ? release() : end("cancel"));
      const onKey = (key: KeyboardEvent) => {
        if (key.key !== "Escape" || current.current === null) return;
        key.preventDefault();
        end("cancel");
      };
      const release = () => {
        stop.current?.();
        stop.current = null;
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      document.addEventListener("keydown", onKey);
      stop.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        document.removeEventListener("keydown", onKey);
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
