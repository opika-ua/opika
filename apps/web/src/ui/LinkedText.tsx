import { Fragment } from "react";
import { linkParts } from "./linkify";

/**
 * Shelter-written text with its http(s) links clickable, everything else as plain text. Renders
 * inline: the caller's Text or <p> keeps the type and the line breaks.
 */
export function LinkedText({ text }: { text: string }) {
  return linkParts(text).map((part) =>
    part.kind === "text" ? (
      <Fragment key={part.start}>{part.text}</Fragment>
    ) : (
      <a
        key={part.start}
        href={part.href}
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
        className="text-accent-text underline underline-offset-4 wrap-anywhere focus-ring"
      >
        {part.label}
      </a>
    ),
  );
}
