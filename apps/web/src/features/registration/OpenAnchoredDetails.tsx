"use client";

import { useEffect } from "react";

/** Opens every closed `<details>` around the element a fragment names, so the anchor lands on text. */
export function openAnchored(hash: string): HTMLElement | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (id === "") return null;
  const target = document.getElementById(id);
  for (let at = target?.closest("details"); at; at = at.parentElement?.closest("details")) {
    at.open = true;
  }
  return target;
}

/**
 * /prytulkam's questions are closed `<details>`; a link to one (`#pravyla`, the hero's jump links,
 * the consent line) opens it. On load, on hashchange, and on a click on a same-page link, since
 * clicking the current hash again fires no hashchange. Renders nothing.
 */
export function OpenAnchoredDetails() {
  useEffect(() => {
    const open = () => {
      const target = openAnchored(window.location.hash);
      if (target?.closest("details")) target.scrollIntoView({ block: "start" });
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href*='#']");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.pathname !== window.location.pathname || link.hash === "") return;
      // Before the browser scrolls, so it scrolls to the opened question.
      openAnchored(link.hash);
    };
    open();
    window.addEventListener("hashchange", open);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", open);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
