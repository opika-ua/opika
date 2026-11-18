"use client";

import type { MouseEvent } from "react";
import { buttonClass } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { REGISTRATION_ANCHOR, REGISTRATION_HEADING_ID } from "./form-state";

/**
 * «Зареєструвати притулок» as an in-page link to the form (§13.1): the hero on a phone and the end
 * of /prytulkam. A plain anchor, so it works without JS; with JS it scrolls smoothly (unless motion
 * is reduced) and moves focus to the form's heading.
 */
export function RegistrationAnchorButton({
  label,
  className,
}: {
  label: string;
  /** Layout only. */
  className?: string;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const section = document.getElementById(REGISTRATION_ANCHOR);
    if (section === null) return;
    event.preventDefault();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    window.history.pushState(null, "", `#${REGISTRATION_ANCHOR}`);
    document.getElementById(REGISTRATION_HEADING_ID)?.focus({ preventScroll: true });
  };
  return (
    <a
      href={`#${REGISTRATION_ANCHOR}`}
      onClick={onClick}
      className={cx(buttonClass("primary", "lg"), className)}
    >
      {label}
    </a>
  );
}
