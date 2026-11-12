import { uk } from "@opika/i18n";
import { useId } from "react";
import { Heading } from "../../ui/Heading";
import { LinkedText } from "../../ui/LinkedText";

/**
 * «Про притулок» on the shelter page: the shelter's own text under its heading, shown verbatim
 * (line breaks kept, no quotes, http(s) links clickable). The only page it renders on. The caller passes null for a shelter
 * with no text and nothing is drawn: no heading over nothing and no placeholder.
 */
export function ShelterAboutSection({ text }: { text: string | null }) {
  const headingId = useId();
  if (text === null) return null;
  return (
    <section aria-labelledby={headingId} className="flex max-w-160 flex-col gap-3">
      <Heading level={2} look="section" id={headingId}>
        {uk.shelterPage.aboutHeading}
      </Heading>
      <p className="whitespace-pre-line break-words text-body text-ink-2">
        <LinkedText text={text} />
      </p>
    </section>
  );
}

/** The text as the page shows it, or null when there is none to show (absent or only blanks). */
export const shownAboutText = (description: { uk: string } | null): string | null =>
  description === null ? null : description.uk.trim() || null;
