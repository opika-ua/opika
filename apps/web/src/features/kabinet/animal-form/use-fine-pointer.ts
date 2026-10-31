import { useSyncExternalStore } from "react";

const QUERY = "(hover: hover) and (pointer: fine)";

const subscribe = (notify: () => void) => {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", notify);
  return () => list.removeEventListener("change", notify);
};

/**
 * True on a device whose main input is a mouse. The server and the hydration pass answer `true`
 * (the same markup on both sides), then the browser's own answer replaces it.
 */
export const useFinePointer = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
