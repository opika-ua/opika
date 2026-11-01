"use client";

import { useEffect, useRef } from "react";

/**
 * Toggles an `is-scrolling` class on a scrollable element for `idleMs`
 * after each scroll event, so CSS can show something (a custom scrollbar
 * thumb, say) only while the element is actually in motion, hiding it
 * again once it settles. Pairs with hover for the usual "shows on hover
 * or while scrolling" pattern - this hook only owns the scrolling half,
 * `:hover` in CSS already covers the other.
 *
 * Direct `classList` writes, not `useState`, on purpose: a scroll handler
 * can fire many times a second, and none of this needs to flow back
 * through React's render cycle - it only ever toggles one class on one
 * DOM node CSS already reads.
 */
export function useScrollingClass<T extends HTMLElement>(idleMs = 500) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      node.classList.add("is-scrolling");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => node.classList.remove("is-scrolling"), idleMs);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      clearTimeout(idleTimer);
    };
  }, [idleMs]);

  return ref;
}
