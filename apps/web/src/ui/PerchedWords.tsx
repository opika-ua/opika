"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * Display-heading text with a mascot sitting on one word: the last word of the first line, so it
 * never floats over a line that wrapped away from it. The line is only known in the browser (font
 * and width decide it), hence the client file; the server render seats it on `initial`.
 * `mascot` is a `<Mascot perch="word">`.
 */
export function PerchedWords({
  text,
  initial,
  mascot,
}: {
  text: string;
  /** Word index used before the browser has measured; defaults to the last word. */
  initial?: number;
  mascot: ReactNode;
}) {
  const words = text.split(" ");
  const [anchor, setAnchor] = useState(initial ?? words.length - 1);
  const root = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const host = root.current;
    if (host === null) return;
    const measure = () => {
      const spans = Array.from(host.querySelectorAll<HTMLElement>("[data-word]"));
      const firstTop = spans[0]?.offsetTop ?? 0;
      const next = spans.findIndex((span) => span.offsetTop > firstTop + 2);
      setAnchor(next === -1 ? spans.length - 1 : Math.max(next - 1, 0));
    };
    measure();
    const observer = new ResizeObserver(measure);
    // An inline span has no box to observe; its block parent resizes with the width.
    observer.observe(host.parentElement ?? host);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={root}>
      {words.map((word, index) => (
        <span
          // The words are fixed text; position is the identity.
          key={index}
        >
          {index > 0 && " "}
          <span data-word="" className={index === anchor ? "relative" : undefined}>
            {index === anchor && mascot}
            {word}
          </span>
        </span>
      ))}
    </span>
  );
}
