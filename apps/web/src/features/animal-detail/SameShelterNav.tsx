"use client";

import { type MouseEvent, type ReactNode, useContext } from "react";
import { OverlayHopContext } from "../animal-overlay/overlay-hop";

/**
 * The card's Link would push a soft navigation, which the overlay's interception catches from any
 * `/tvaryny` page: an overlay over the full page, or a stacked entry and a second entrance inside it.
 */
export function SameShelterNav({ children }: { children: ReactNode }) {
  const hop = useContext(OverlayHopContext);

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    const href = anchor.getAttribute("href");
    if (!href) return;

    // Stopped in the capture phase, so the Link's own click handler never runs.
    event.stopPropagation();
    if (hop) {
      event.preventDefault();
      hop(href);
    }
    // No overlay: the browser follows the link itself, a full page in place of this one.
  };

  return (
    <div className="contents" onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
